from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fabric_cm import __version__
from fabric_cm.credmgr.swagger_server.routes import router


def create_app() -> FastAPI:
    app = FastAPI(
        title="Fabric Credential Manager API",
        version=__version__,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Length", "Content-Range"],
    )

    app.include_router(router)
    return app
