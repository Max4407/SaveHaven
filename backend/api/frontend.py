from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse


def create_frontend_router(frontend_dist_path: Path) -> APIRouter:
    router = APIRouter(include_in_schema=False)
    resolved_dist_path = frontend_dist_path.resolve()
    index_path = resolved_dist_path / "index.html"

    @router.get("/{requested_path:path}", response_class=FileResponse)
    def serve_frontend(requested_path: str) -> FileResponse:
        if requested_path == "api" or requested_path.startswith("api/"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

        requested_file = (resolved_dist_path / requested_path).resolve()
        try:
            requested_file.relative_to(resolved_dist_path)
        except ValueError as error:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from error

        if requested_path and requested_file.is_file():
            return FileResponse(requested_file)

        if Path(requested_path).suffix or not index_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

        return FileResponse(index_path)

    return router
