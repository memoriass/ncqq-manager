# INTERFACE

Updated: 2025-02-14T00:20:00Z

- services/operation_log_context.py
  - build_operator_payload(request: Request | None, session: dict, extra: dict[str, Any] | None = None) -> dict[str, Any]
- routers/user_router.py
  - api_create_user(req: UserCreateRequest, request: Request, session: dict) -> dict
  - api_edit_user(user_uuid: str, req: UserEditRequest, request: Request, session: dict) -> dict
  - api_delete_user(user_uuid: str, request: Request, session: dict) -> dict
  - api_assign_instances(user_uuid: str, req: UserInstancesRequest, request: Request, session: dict) -> dict
  - api_regenerate_apikey(user_uuid: str, request: Request, session: dict) -> dict
- routers/node_router.py
  - save_cluster_config(request: Request, session: dict) -> dict
  - api_add_node(req: NodeRequest, request: Request, session: dict) -> dict
  - api_edit_node(node_id: str, req: NodeRequest, request: Request, session: dict) -> dict
  - api_delete_node(node_id: str, request: Request, session: dict) -> dict
  - get_node_logs(lines: int = 500, node_id: str = "local", session: dict = Depends(get_current_user)) -> dict
  - proxy_node_request(node_id: str, path: str, request: Request, session: dict) -> Response | JSONResponse
- services/cluster_manager.py
  - proxy_to_node_async(node_id: str, method: str, path: str, timeout: float = 5.0, **kwargs) -> Tuple[int, Optional[bytes], str]
- routers/backup_router.py
  - _validate_zip_members(zipf: zipfile.ZipFile) -> None
  - api_backup_download(request: Request, session: dict) -> FileResponse
  - api_restore_backup(request: Request, file: UploadFile, session: dict) -> dict

