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
#
# Author: Komal Thareja (kthare10@renci.org)
import threading
from datetime import datetime
from typing import List

from fabric_cm.db import Base, Tokens
from sqlalchemy import create_engine, desc
from sqlalchemy.orm import scoped_session, sessionmaker


class DbApi:
    """
    Implements interface to Postgres database
    """

    def __init__(self, *, user: str, password: str, database: str, db_host: str, logger):
        # Connecting to PostgreSQL server at localhost using psycopg2 DBAPI
        self.db_engine = create_engine("postgresql+psycopg2://{}:{}@{}/{}".format(user, password, db_host, database))
        self.logger = logger
        self.session_factory = sessionmaker(bind=self.db_engine)
        self.sessions = {}

    def get_session(self):
        thread_id = threading.get_ident()
        session = None
        if thread_id in self.sessions:
            session = self.sessions.get(thread_id)
        else:
            session = scoped_session(self.session_factory)
            self.sessions[thread_id] = session
        return session

    def create_db(self):
        """
        Create the database
        """
        Base.metadata.create_all(self.db_engine)

    def set_logger(self, logger):
        """
        Set the logger
        """
        self.logger = logger

    def reset_db(self):
        """
        Reset the database
        """
        session = self.get_session()
        try:
            session.query(Tokens).delete()
            session.commit()
        except Exception as e:
            session.rollback()
            self.logger.error(f"Exception occurred: {e}", stack_info=True)
            raise e

    def add_token(self, *, user_id: str, user_email: str, project_id: str, created_from: str, state: int,
                  token_hash: str, created_at: datetime, expires_at: datetime, comment: str):
        """
        Add a token
        @param user_id User ID
        @param user_email User Email
        @param project_id Project ID
        @param created_from Remote IP Address
        @param state Token State
        @param token_hash Token hash
        @param created_at creation time of the token
        @param expires_at expiration time of the token
        @param comment comment describing when token was created
        """
        session = self.get_session()
        try:
            # Save the token in the database
            token_obj = Tokens(user_id=user_id, user_email=user_email, project_id=project_id,
                               created_from=created_from, state=state, token_hash=token_hash,
                               expires_at=expires_at, created_at=created_at, comment=comment)
            session.add(token_obj)
            session.commit()
        except Exception as e:
            session.rollback()
            self.logger.error(f"Exception occurred: {e}", stack_info=True)
            raise e

    def update_token(self, *, token_hash: str, state: int):
        """
        Update token
        @param token_hash token_hash
        @param state Token State
        """
        session = self.get_session()
        try:
            token = session.query(Tokens).filter_by(token_hash=token_hash).one_or_none()
            if token is not None:
                token.state = state
            else:
                raise Exception(f"Token #{token_hash} not found!")
            session.commit()
        except Exception as e:
            session.rollback()
            self.logger.error(f"Exception occurred: {e}", stack_info=True)
            raise e

    def remove_token(self, *, token_hash: str):
        """
        Remove a token
        @param token_hash token hash
        """
        session = self.get_session()
        try:
            # Delete the actor in the database
            session.query(Tokens).filter_by(token_hash=token_hash).delete()
            session.commit()
        except Exception as e:
            session.rollback()
            self.logger.error(f"Exception occurred: {e}", stack_info=True)
            raise e

    def get_tokens(self, *, user_id: str = None, user_email: str = None, project_id: str = None,
                   token_hash: str = None, expires: datetime = None, states: List[int] = None,
                   offset: int = 0, limit: int = 5) -> list:
        """
        Get tokens
        @param user_id      User Id
        @param user_email   User's email
        @param project_id   Project Id
        @param token_hash   Token hash
        @param expires      Expiration Time
        @param states       list of states
        @param offset       offset
        @param limit        limit
        @return list of tokens
        """
        result = []
        session = self.get_session()
        try:
            filter_dict = self.__create_token_filter(user_id=user_id, project_id=project_id, user_email=user_email,
                                                     token_hash=token_hash)

            rows = session.query(Tokens).filter_by(**filter_dict)

            if expires is not None:
                rows = rows.filter(Tokens.expires_at < expires)

            if states is not None:
                rows = rows.filter(Tokens.state.in_(states))

            rows = rows.order_by(desc(Tokens.expires_at))

            if offset is not None and limit is not None:
                rows = rows.offset(offset).limit(limit)

            for row in rows.all():
                result.append(self.__generate_dict_from_row(row=row))
        except Exception as e:
            self.logger.error(f"Exception occurred: {e}", stack_info=True)
            raise e
        return result

    @staticmethod
    def __create_token_filter(*, user_id: str, user_email: str, project_id: str, token_hash: str) -> dict:

        filter_dict = {}
        if user_id is not None:
            filter_dict['user_id'] = user_id
        if user_email is not None:
            filter_dict['user_email'] = str(user_email)
        if project_id is not None:
            filter_dict['project_id'] = str(project_id)
        if token_hash is not None:
            filter_dict['token_hash'] = token_hash
        return filter_dict

    @staticmethod
    def __generate_dict_from_row(row):
        d = row.__dict__.copy()
        for k in row.__dict__:
            if d[k] is None:
                d.pop(k)
        return d
