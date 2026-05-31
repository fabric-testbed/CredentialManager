from typing import List, Optional

from fastapi import APIRouter, Request, Depends, Query, Body
from pydantic import BaseModel

from fabric_cm.credmgr.swagger_server.response import tokens_controller, default_controller, version_controller
from fabric_cm.credmgr.swagger_server.dependencies import get_login_claims, get_login_or_token_claims
from fabric_cm.credmgr.swagger_server.models.request import Request as RequestModel
from fabric_cm.credmgr.swagger_server.models.token_post import TokenPost

router = APIRouter()


# Pydantic models for JSON body parsing
class RefreshTokenBody(BaseModel):
    refresh_token: str


class TokenPostBody(BaseModel):
    type: str
    token: str


@router.get("/version")
def version_get():
    return version_controller.version_get()


@router.get("/certs")
def certs_get():
    return default_controller.certs_get()


@router.post("/tokens/create")
def tokens_create_post(request: Request,
                       claims: dict = Depends(get_login_claims),
                       project_id: Optional[str] = Query(None),
                       project_name: Optional[str] = Query(None),
                       scope: Optional[str] = Query(None),
                       lifetime: int = Query(4),
                       comment: Optional[str] = Query(None)):
    return tokens_controller.tokens_create_post(
        request=request, project_id=project_id, project_name=project_name,
        scope=scope, lifetime=lifetime, comment=comment, claims=claims)


@router.delete("/tokens")
def tokens_delete_delete(claims: dict = Depends(get_login_claims)):
    return tokens_controller.tokens_delete_delete(claims=claims)


@router.delete("/tokens/{token_hash}")
def tokens_delete_token_hash_delete(token_hash: str,
                                    claims: dict = Depends(get_login_claims)):
    return tokens_controller.tokens_delete_token_hash_delete(
        token_hash=token_hash, claims=claims)


@router.post("/tokens/refresh")
def tokens_refresh_post(request: Request,
                        body: RefreshTokenBody,
                        project_id: Optional[str] = Query(None),
                        project_name: Optional[str] = Query(None),
                        scope: Optional[str] = Query(None)):
    model = RequestModel(refresh_token=body.refresh_token)
    return tokens_controller.tokens_refresh_post(
        request=request, body=model, project_id=project_id,
        project_name=project_name, scope=scope)


@router.post("/tokens/revoke")
def tokens_revoke_post(body: RefreshTokenBody,
                       claims: dict = Depends(get_login_or_token_claims)):
    model = RequestModel(refresh_token=body.refresh_token)
    return tokens_controller.tokens_revoke_post(body=model, claims=claims)


@router.post("/tokens/revokes")
def tokens_revokes_post(request: Request,
                        body: TokenPostBody,
                        claims: dict = Depends(get_login_or_token_claims)):
    model = TokenPost(type=body.type, token=body.token)
    return tokens_controller.tokens_revokes_post(
        request=request, body=model, claims=claims)


@router.get("/tokens")
def tokens_get(token_hash: Optional[str] = Query(None),
               project_id: Optional[str] = Query(None),
               expires: Optional[str] = Query(None),
               states: Optional[List[str]] = Query(None),
               limit: Optional[int] = Query(None),
               offset: Optional[int] = Query(None),
               claims: dict = Depends(get_login_or_token_claims)):
    return tokens_controller.tokens_get(
        token_hash=token_hash, project_id=project_id, expires=expires,
        states=states, limit=limit, offset=offset, claims=claims)


@router.get("/tokens/revoke_list")
def tokens_revoke_list_get(project_id: Optional[str] = Query(None)):
    return tokens_controller.tokens_revoke_list_get(project_id=project_id)


@router.post("/tokens/validate")
def tokens_validate_post(body: TokenPostBody):
    model = TokenPost(type=body.type, token=body.token)
    return tokens_controller.tokens_validate_post(body=model)


@router.get("/tokens/create_cli")
def tokens_create_cli_get(request: Request,
                          project_id: Optional[str] = Query(None),
                          project_name: Optional[str] = Query(None),
                          scope: Optional[str] = Query(None),
                          lifetime: int = Query(4),
                          comment: Optional[str] = Query(None),
                          redirect_uri: Optional[str] = Query(None)):
    return tokens_controller.tokens_create_cli_get(
        request=request, project_id=project_id, project_name=project_name,
        scope=scope, lifetime=lifetime, comment=comment,
        redirect_uri=redirect_uri)


@router.post("/tokens/create_llm")
def tokens_create_llm_post(key_name: Optional[str] = Query(None),
                            comment: Optional[str] = Query(None),
                            duration: int = Query(30),
                            models: Optional[str] = Query(None),
                            claims: dict = Depends(get_login_or_token_claims)):
    return tokens_controller.tokens_create_llm_post(
        key_name=key_name, comment=comment, duration=duration,
        models=models, claims=claims)


@router.delete("/tokens/delete_llm/{llm_key_id}")
def tokens_delete_llm_delete(llm_key_id: str,
                              claims: dict = Depends(get_login_or_token_claims)):
    return tokens_controller.tokens_delete_llm_delete(
        llm_key_id=llm_key_id, claims=claims)


@router.get("/tokens/llm_keys")
def tokens_llm_keys_get(limit: int = Query(200),
                         offset: int = Query(0),
                         claims: dict = Depends(get_login_or_token_claims)):
    return tokens_controller.tokens_llm_keys_get(
        limit=limit, offset=offset, claims=claims)


@router.get("/tokens/llm_models")
def tokens_llm_models_get(claims: dict = Depends(get_login_or_token_claims)):
    return tokens_controller.tokens_llm_models_get(claims=claims)
