#!/usr/bin/env python3
# MIT License
#
# Copyright (c) 2020 FABRIC Testbed
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#
# Author Komal Thareja (kthare10@renci.org)
from fabric.credmgr.utils import db_engine, IdTokens, LOG

from contextlib import contextmanager
from sqlalchemy.orm import scoped_session, sessionmaker



@contextmanager
def session_scope(db_engine):
    """Provide a transactional scope around a series of operations."""
    session = scoped_session(sessionmaker(db_engine))
    try:
        yield session
        session.commit()
    except:
        session.rollback()
        raise
    finally:
        session.close()


class Database:
    """
    Implements the database interface to IdTokens
    """

    def __init__(self):
        """
        Constructor
        """
        self.log = LOG

    def create_tokens(self, user_id:str, token:dict, project="all", scope="all"):
        """
        Saves token to database

        @params user_id: User Id to identity a user
        @params token: CILogon Identity Token
        @params project: Project for which token is created
        @params scope: Scope of the toke

        @raises Exception in case of error
        """
        try:
            # Extract Id token
            self.log.debug("user_id = {}".format(user_id))
            id_token_string = token.get('id_token')
            if id_token_string:
                self.log.debug("id_token: " + id_token_string)

            # Extract refresh_token
            refresh_token_string = None
            if 'refresh_token' in token:
                refresh_token_string = token.get('refresh_token')
                if refresh_token_string :
                    self.log.debug("refresh_token: " + refresh_token_string)

            # Save the token in the database
            id_obj = IdTokens(user_id=user_id, project=project, scope=scope, id_token= id_token_string,
                              refresh_token=refresh_token_string)
            with session_scope(db_engine) as session:
                session.add(id_obj)

            self.log.debug("Added token to database!")
        except Exception as e:
            self.log.error("Exception occurred " + str(e))
            raise e

    def read_token(self, user_id: str) -> dict:
        """
        Fetch token from database for a given user_id
        @params user_id: user id identifying a  user

        @returns token for the user
        @raises Exception in case of error
        """
        # Read
        try:
            with session_scope(db_engine) as session:
                id_token = session.query(IdTokens).get(user_id)
                if id_token is None:
                    raise DatabaseError("Token not found for user_id {}".format(user_id))
                result = {"user_id": id_token.user_id, "id_token": id_token.id_token, "refresh_token": id_token.refresh_token}
                return result
        except Exception as e:
            self.log.error("Exception occurred " + str(e))
            raise e

    def delete_token(self, user_id: str):
        """
        Delete a token
        @params user_id: user_id for token to be deleted

        @raises Exception in case of error
        """
        # Delete
        try:
            with session_scope(db_engine) as session:
                id_token = session.query(IdTokens).get(user_id)
                if id_token is not None:
                    session.delete(id_token)
        except Exception as e:
            self.log.error("Exception occurred " + str(e))
            raise e


class DatabaseError(Exception):
    pass