"""Run the local release readiness checks used by CI."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT / "frontend"
PYTHON_TARGETS = [
    "main.py",
    "start.py",
    "middleware",
    "routers",
    "services",
    "scripts",
    "tests",
]


@dataclass(frozen=True)
class CheckCommand:
    name: str
    args: list[str]
    cwd: Path = ROOT


def _run(command: CheckCommand) -> int:
    args = _resolve_command(command.args)
    if args is None:
        print(f"\n==> {command.name}", flush=True)
        print(f"!! executable not found: {command.args[0]}", flush=True)
        return 127

    print(f"\n==> {command.name}", flush=True)
    print(f"$ {' '.join(args)}", flush=True)
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    completed = subprocess.run(args, cwd=command.cwd, env=env, check=False)
    if completed.returncode:
        print(f"!! {command.name} failed with exit code {completed.returncode}", flush=True)
    return completed.returncode


def _resolve_command(args: list[str]) -> list[str] | None:
    executable = args[0]
    if executable == "npm":
        npm_path = shutil.which("npm.cmd") or shutil.which("npm")
        if npm_path is None:
            return None
        return [npm_path, *args[1:]]
    return args


def build_commands(args: argparse.Namespace) -> list[CheckCommand]:
    commands = [
        CheckCommand(
            "ruff full check",
            [sys.executable, "-m", "ruff", "check", *PYTHON_TARGETS],
        ),
        CheckCommand(
            "ruff unused import/local check",
            [
                sys.executable,
                "-m",
                "ruff",
                "check",
                "--select",
                "F401,F841",
                *PYTHON_TARGETS,
            ],
        ),
        CheckCommand(
            "python compileall",
            [sys.executable, "-m", "compileall", "-q", *PYTHON_TARGETS],
        ),
    ]

    if not args.skip_tests:
        commands.append(CheckCommand("pytest smoke tests", [sys.executable, "-m", "pytest", "-q"]))

    if not args.skip_frontend:
        commands.append(CheckCommand("frontend production build", ["npm", "run", "build"], cwd=FRONTEND_DIR))

    return commands


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run release readiness checks.")
    parser.add_argument(
        "--skip-tests",
        action="store_true",
        help="Skip pytest smoke tests.",
    )
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Skip frontend production build.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    failures: list[str] = []

    for command in build_commands(args):
        if _run(command):
            failures.append(command.name)

    if failures:
        print("\nRelease check failed:", flush=True)
        for failure in failures:
            print(f"- {failure}", flush=True)
        return 1

    print("\nRelease check passed.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
