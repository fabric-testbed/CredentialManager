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
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, String, Integer, Sequence

from credmgr.utils.utils import *

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

# Connecting to PostgreSQL server at localhost using psycopg2 DBAPI
user = CONFIG.get('database', 'db-user')
password = CONFIG.get('database', 'db-password')
database = CONFIG.get('database', 'db-name')
db_host = CONFIG.get('database', 'db-host')
db_engine = create_engine("postgresql+psycopg2://{}:{}@{}/{}".format(user, password, db_host, database))
Base.metadata.create_all(db_engine)