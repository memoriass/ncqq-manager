"""
资源路由 - 壁纸/背景图自动发现 & 头像代理缓存
扫描 resource/images/{category}/ 下的图片，按宽高比分为横图/竖图返回。
头像缓存至 resource/avatars/{uin}.jpg，前端统一使用本地端点。
"""
import os
import re
import asyncio
import urllib.request
from fastapi import APIRouter, Query, Path, Response, Depends
from fastapi.responses import FileResponse
from middleware.rate_limiter import public_speed_limit
from services.log import logger

router = APIRouter(prefix="/api/resource", tags=["resource"])

_RESOURCE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "resource")
_AVATAR_DIR = os.path.join(_RESOURCE_DIR, "avatars")
_IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
_CATEGORY_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")

# 确保头像缓存目录存在
os.makedirs(_AVATAR_DIR, exist_ok=True)


def _classify_images(category: str) -> dict:
    """扫描目录，用 PIL 读取尺寸，分为 landscape / portrait。"""
    folder = os.path.join(_RESOURCE_DIR, "images", category)
    result: dict = {"landscape": [], "portrait": []}
    if not os.path.isdir(folder):
        return result

    try:
        from PIL import Image
    except ImportError:
        logger.warning("Pillow 未安装，壁纸尺寸检测不可用")
        # 回退：全部归入 landscape
        for f in os.listdir(folder):
            if os.path.splitext(f)[1].lower() in _IMG_EXTS:
                result["landscape"].append(f"/resource/images/{category}/{f}")
        return result

    for f in os.listdir(folder):
        ext = os.path.splitext(f)[1].lower()
        if ext not in _IMG_EXTS:
            continue
        path = os.path.join(folder, f)
        try:
            with Image.open(path) as img:
                w, h = img.size
            url = f"/resource/images/{category}/{f}"
            if w >= h:
                result["landscape"].append(url)
            else:
                result["portrait"].append(url)
        except Exception:
            logger.debug("无法读取图片 %s", path)
    return result


@router.get("/wallpapers")
async def get_wallpapers(category: str = Query(default="user-dashboard")):
    """返回指定分类下按方向分组的壁纸列表。"""
    if not _CATEGORY_RE.match(category):
        return {"status": "error", "message": "invalid category"}
    data = await asyncio.to_thread(_classify_images, category)
    return {"status": "ok", **data}


def _fetch_avatar(url: str) -> bytes | None:
    """同步下载头像，供 asyncio.to_thread 调用。"""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.read()
    except Exception:
        return None


@router.get("/avatar/{uin}", dependencies=[Depends(public_speed_limit(2.0))])
async def get_avatar(uin: str = Path(..., pattern=r"^\d{5,12}$")):
    """代理并缓存 QQ 头像到 resource/avatars/{uin}.jpg。"""
    cache_path = os.path.join(_AVATAR_DIR, f"{uin}.jpg")
    if os.path.exists(cache_path):
        return FileResponse(cache_path, media_type="image/jpeg")

    url = f"https://q1.qlogo.cn/g?b=qq&nk={uin}&s=640"
    data = await asyncio.to_thread(_fetch_avatar, url)
    if data and len(data) > 500:
        await asyncio.to_thread(_write_file, cache_path, data)
        return Response(content=data, media_type="image/jpeg")

    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=url)


_GROUP_AVATAR_DIR = os.path.join(_RESOURCE_DIR, "group_avatars")
os.makedirs(_GROUP_AVATAR_DIR, exist_ok=True)


def _write_file(path: str, data: bytes) -> None:
    with open(path, "wb") as f:
        f.write(data)


@router.get("/group_avatar/{group_id}", dependencies=[Depends(public_speed_limit(2.0))])
async def get_group_avatar(group_id: str = Path(..., pattern=r"^\d{5,12}$")):
    """代理并缓存群头像到 resource/group_avatars/{group_id}.jpg。"""
    cache_path = os.path.join(_GROUP_AVATAR_DIR, f"{group_id}.jpg")
    if os.path.exists(cache_path):
        return FileResponse(cache_path, media_type="image/jpeg")

    url = f"https://p.qlogo.cn/gh/{group_id}/{group_id}/640/"
    data = await asyncio.to_thread(_fetch_avatar, url)
    if data and len(data) > 500:
        await asyncio.to_thread(_write_file, cache_path, data)
        return Response(content=data, media_type="image/jpeg")

    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=url)

