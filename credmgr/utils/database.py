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
import logging


from sqlalchemy import create_engine, Column, String, Integer, Sequence
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from credmgr import LOGGER, CONFIG

Base = declarative_base()


class IdTokens(Base):
    """
    Represents IdTokens Database Table
    """
    __tablename__ = 'IdTokens'
    id = Column(Integer, Sequence('id_token_id', start=1, increment=1), autoincrement=True, unique=True)
    user_id = Column(String, primary_key=True)
    project = Column(String)
    scope = Column(String)
    id_token = Column(String)
    refresh_token = Column(String)


class Database:
    """
    Implements the database interface to IdTokens
    """

    def __init__(self, user=None, password=None, database=None):
        """
        Constructor
        @params user: database user
        @params password: database user password
        @params database: database name
        """
        if user is None:
            user = CONFIG.get('database', 'db-user')
        if password is None:
            password = CONFIG.get('database', 'db-password')
        if database is None:
            database = CONFIG.get('database', 'db-name')

        # Connecting to PostgreSQL server at localhost using psycopg2 DBAPI
        self.db = create_engine("postgresql+psycopg2://{}:{}@database/{}".format(user, password, database))
        Session = sessionmaker(self.db)
        self.session = Session()
        Base.metadata.create_all(self.db)
        self.log = logging.getLogger(LOGGER + '.' + __class__.__name__ )

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
            self.session.add(id_obj)
            self.session.commit()
        except Exception as e:
            self.log.error("Exception occurred " + str(e))
            raise e

    def read_tokens(self, user_id:dict) -> IdTokens:
        """
        Fetch token from database for a given user_id
        @params user_id: user id identifying a  user

        @returns token for the user
        @raises Exception in case of error
        """
        # Read
        try:
            id_token = self.session.query(IdTokens).filter(IdTokens.user_id==user_id).all()
            if id_token is None or len(id_token) != 1:
                raise DatabaseError("Token not found for user_id {}".format(user_id))
            return id_token[0]
        except Exception as e:
            self.log.error("Exception occurred " + str(e))
            raise e

    def read_all_tokens(self):
        """
        Read all tokens from database

        @return return list of IdTokens
        @raises Exception in case of error
        """
        # Read
        try:
            tokens = self.session.query(IdTokens).all()
            return tokens
        except Exception as e:
            self.log.error("Exception occurred " + str(e))
            raise e

    def delete_tokens(self, token):
        """
        Delete a token
        @params token: token to be deleted

        @raises Exception in case of error
        """
        # Delete
        try:
            self.session.delete(token)
            self.session.commit()
        except Exception as e:
            self.log.error("Exception occurred " + str(e))
            raise e


class DatabaseError(Exception):
    pass
