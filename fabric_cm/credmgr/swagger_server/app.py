from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fabric_cm import __version__
from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.swagger_server.routes import router


def create_app() -> FastAPI:
    app = FastAPI(
        title="Fabric Credential Manager API",
        version=__version__,
    )

    allowed_origins = CONFIG_OBJ.get_cors_allowed_origins()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins or ["*"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "DNT", "User-Agent", "X-Requested-With", "If-Modified-Since",
            "Cache-Control", "Content-Type", "Range", "Authorization",
        ],
        expose_headers=["Content-Length", "Content-Range"],
    )

    app.include_router(router)
    return app
