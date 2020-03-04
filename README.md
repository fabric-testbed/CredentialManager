# CredentialManager

## Overview
Fabric uses CILogon 2.0 and COmanage for Identity Authentication and Authorization management. 
Fabric Credential Manager provides generate and refreshes credentials for Fabric users. 
This package includes:
 - A Flask application that users can be directed to in order to obtain OAuth2 tokens from CILogon.
 - Swagger generated Server which supports APIs to create/get/delete/refresh tokens
 - CredMgr daemon which monitors and refreshes the saved tokens 

## Requirements
- Python 3.6+
- HTTPS-enabled web server 
- WSGI server
```
yum install httpd
yum install mod_wsgi
yum install mod_ssl
yum install httpd-devel
yum install python3
yum install python3-devel
pip3 install mod-wsgi
mod_wsgi-express install-module > /etc/httpd/conf.modules.d/02-wsgi.conf
```

## API
API Documentation can be found [here](https://app.swaggerhub.com/apis-docs/kthare10/credmgr/1.0.0#/)

## Swagger Server
The swagger server was generated by the [swagger-codegen](https://github.com/swagger-api/swagger-codegen) project. By using the
[OpenAPI-Spec](https://github.com/swagger-api/swagger-core/wiki) from a remote server, you can easily generate a server stub.  This
is an example of building a swagger-enabled Flask server.

This example uses the [Connexion](https://github.com/zalando/connexion) library on top of Flask.

## Generate a new server stub
In a browser, go to [Swagger definition](https://app.swaggerhub.com/apis/kthare10/credmgr/1.0.0)

From the generate code icon (downward facing arrow), select Download API > JSON Resolved

A file named swagger-client-generated.zip should be downloaded. This file will contain swagger.json. Extract the json file from the swagger-client-generated.zip and run the following command to generate the Flask based server.

```bash
$ swagger-codegen generate -i swagger.json -l python-flask -o credmgr
```

## Usage
To run the Credential Manage, please execute the following from the root directory:

 ```
 git clone https://github.com/fabric-testbed/CredentialManager.git 
 ./install.sh
 ```
## Running with Docker

 To run the server on a Docker container, please execute the following from the root directory:

 ```bash
 # building the image
 docker build -t credmgr .

 # starting up a container
 docker run -p 8082:8082 credmgr

 # bring using via docker-compose
 docker-compose up -d
 ```
## Example

Create a token for user 'testUser'.
```bash
curl -X POST -i "localhost:8082/fabric/credmgr/create?userName=testUser" -H "accept: application/json"
Hello, testUser
HTTP/1.0 200 OK
Content-Type: application/json
Content-Length: 58
Server: Werkzeug/1.0.0 Python/3.6.8
Date: Thu, 27 Feb 2020 15:53:56 GMT

"Please visit https://152.54.14.113:443/key/63DCA81972074659"
```

Get token for user 'testUser'
```bash
curl -X GET -i "localhost:8082/fabric/credmgr/get?userName=testUser" -H "accept: application/json"
HTTP/1.0 200 OK
Content-Type: application/json
Content-Length: 1778
Server: Werkzeug/1.0.0 Python/3.6.8
Date: Thu, 27 Feb 2020 20:01:17 GMT

{
  "status": 200,
  "value": {
    "access_token": "https://cilogon.org/oauth2/accessToken/f73a1b572f98a1c2eb104f3d2a41f87/1582827832162",
    "expires_at": "1608747832.199543",
    "expires_in": "25920000",
    "id_token": "eyJ0eXAiOiJKV1QiLCJraWQiOiIyNDRCMjM1RjZCMjhFMzQxMDhEMTAxRUFDNzM2MkM0RSIsImFsZyI6IlJTMjU2In0.eyJpc3MiOiJodHRwczovL2NpbG9nb24ub3JnIiwic3ViIjoiaHR0cDovL2NpbG9nb24ub3JnL3NlcnZlckEvdXNlcnMvMTE5MDQxMDEiLCJhdWQiOiJjaWxvZ29uOi9jbGllbnRfaWQvMzgwYzJiZmE1ZDk5YWU3NGEzODcxZDg3NGFlOWU2NjkiLCJhdXRoX3RpbWUiOiIxNTgyODI3ODMxIiwiZXhwIjoxNTgyODI4NzMyLCJpYXQiOjE1ODI4Mjc4MzIsImVtYWlsIjoia3RoYXJlMTBAZW1haWwudW5jLmVkdSIsImdpdmVuX25hbWUiOiJLb21hbCIsImZhbWlseV9uYW1lIjoiVGhhcmVqYSIsImNlcnRfc3ViamVjdF9kbiI6Ii9EQz1vcmcvREM9Y2lsb2dvbi9DPVVTL089VW5pdmVyc2l0eSBvZiBOb3J0aCBDYXJvbGluYSBhdCBDaGFwZWwgSGlsbC9DTj1Lb21hbCBUaGFyZWphIEExMTkwNDEwNiIsImlkcCI6InVybjptYWNlOmluY29tbW9uOnVuYy5lZHUiLCJpZHBfbmFtZSI6IlVuaXZlcnNpdHkgb2YgTm9ydGggQ2Fyb2xpbmEgYXQgQ2hhcGVsIEhpbGwiLCJlcHBuIjoia3RoYXJlMTBAdW5jLmVkdSIsImFmZmlsaWF0aW9uIjoiZW1wbG95ZWVAdW5jLmVkdTtzdGFmZkB1bmMuZWR1O21lbWJlckB1bmMuZWR1IiwibmFtZSI6IktvbWFsIFRoYXJlamEiLCJhY3IiOiJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YWM6Y2xhc3NlczpQYXNzd29yZFByb3RlY3RlZFRyYW5zcG9ydCIsImVudGl0bGVtZW50IjoidXJuOm1hY2U6ZGlyOmVudGl0bGVtZW50OmNvbW1vbi1saWItdGVybXMifQ.Jil7levJ3sykxPy70SkV0W01I9JjvPMSSo-T5f9kz4CQ_GFBbTSqzF8LFwOKimOAtkYgapo6olpiWFJuOWpZLiQu7-455xXHeRJdSvU1mYOabjsVJMx2Lv4hHB8OpN1YPoYajXSmVtQxufOkWcbvZS0jmLOM4WJGUc7t3ApEmUm9e8P8v4EonskwZvWx7zBLjKYzYHtf9W7Pk27HdH-ndDUUOQFl-VH5MS_HpZSBBsxEc4LWmwLIBeKuSbMbJ9IHS5Us3DhHygMX2WRvo1E2wzZ0EkKEqCI2OI2Sx5gqfqB8IU3kPm2779m0ZdFzp3-W96PrUsI2hEKWZreue0aYiA",
    "refresh_token": "https://cilogon.org/oauth2/refreshToken/69636d330f2f4acd8f7aef48e2991af9/1582827832162",
    "token_type": "Bearer"
  }
}
```

Refresh token for user 'testUser'
```bash
$ curl -X POST -i "localhost:8082/fabric/credmgr/refresh" -H "accept: application/json" -H "Content-Type: application/json" --data '{"refresh_token": "https://cilogon.org/oauth2/refreshToken/69636d330f2f4acd8f7aef48e2991af9/1582827832162"}'
HTTP/1.0 200 OK
Content-Type: application/json
Content-Length: 1780
Server: Werkzeug/1.0.0 Python/3.6.8
Date: Thu, 27 Feb 2020 20:24:11 GMT

{
  "status": 200,
  "value": {
    "access_token": "https://cilogon.org/oauth2/accessToken/420af01a0a2ce4c557f36c247d2e9dc8/1582835051742",
    "expires_at": "1608755051.7802415",
    "expires_in": "25920000",
    "id_token": "eyJ0eXAiOiJKV1QiLCJraWQiOiIyNDRCMjM1RjZCMjhFMzQxMDhEMTAxRUFDNzM2MkM0RSIsImFsZyI6IlJTMjU2In0.eyJpc3MiOiJodHRwczovL2NpbG9nb24ub3JnIiwic3ViIjoiaHR0cDovL2NpbG9nb24ub3JnL3NlcnZlckEvdXNlcnMvMTE5MDQxMDEiLCJhdWQiOiJjaWxvZ29uOi9jbGllbnRfaWQvMzgwYzJiZmE1ZDk5YWU3NGEzODcxZDg3NGFlOWU2NjkiLCJhdXRoX3RpbWUiOiIxNTgyODI3ODMxIiwiZXhwIjoxNTgyODM1OTUxLCJpYXQiOjE1ODI4MzUwNTEsImVtYWlsIjoia3RoYXJlMTBAZW1haWwudW5jLmVkdSIsImdpdmVuX25hbWUiOiJLb21hbCIsImZhbWlseV9uYW1lIjoiVGhhcmVqYSIsImNlcnRfc3ViamVjdF9kbiI6Ii9EQz1vcmcvREM9Y2lsb2dvbi9DPVVTL089VW5pdmVyc2l0eSBvZiBOb3J0aCBDYXJvbGluYSBhdCBDaGFwZWwgSGlsbC9DTj1Lb21hbCBUaGFyZWphIEExMTkwNDEwNiIsImlkcCI6InVybjptYWNlOmluY29tbW9uOnVuYy5lZHUiLCJpZHBfbmFtZSI6IlVuaXZlcnNpdHkgb2YgTm9ydGggQ2Fyb2xpbmEgYXQgQ2hhcGVsIEhpbGwiLCJlcHBuIjoia3RoYXJlMTBAdW5jLmVkdSIsImFmZmlsaWF0aW9uIjoiZW1wbG95ZWVAdW5jLmVkdTtzdGFmZkB1bmMuZWR1O21lbWJlckB1bmMuZWR1IiwibmFtZSI6IktvbWFsIFRoYXJlamEiLCJhY3IiOiJ1cm46b2FzaXM6bmFtZXM6dGM6U0FNTDoyLjA6YWM6Y2xhc3NlczpQYXNzd29yZFByb3RlY3RlZFRyYW5zcG9ydCIsImVudGl0bGVtZW50IjoidXJuOm1hY2U6ZGlyOmVudGl0bGVtZW50OmNvbW1vbi1saWItdGVybXMifQ.LemXfK9nDsZd-uyCcn5qEc_LlUApd9KSdK3_XD7rLLkpl9Zc9CJfHBrH45rJTN6VmixZTCvibola-3pD7S-PaLPHJdTELrprkNsR9xilgXpxCvh_aDfC-7sIX3LCMxx3tYzYvIDy2WF2yTgN1Rav3HSF8ysx_Iwaw6wrVds2d4rRaAprZwIlO8LjZ35tkPT85C-hAxB_hFKJT-WMKlBmnDQjKtgD8YXM_gmYAVf--d57lND83bKi5KCttcxwqVt17dJvesFEfwAOmHRQfJWiLcfrrHQHhcCyemUbl9EJqLmF69tMwoE0O-zULZlaiSFfblDeJ6BZE2nr9XVj4ldZyA",
    "refresh_token": "https://cilogon.org/oauth2/refreshToken/76def6ab47a52da415275db9d27feba4/1582835051742",
    "token_type": "Bearer"
  }
}
```
