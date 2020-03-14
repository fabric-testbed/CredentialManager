import logging

from sqlalchemy import create_engine, Column, String, Integer, ForeignKey, Sequence
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from credmgr import LOGGER

Base = declarative_base()


class IdTokens(Base):
    __tablename__ = 'IdTokens'
    id = Column(Integer, Sequence('id_token_id', start=1, increment=1), autoincrement=True, unique=True)
    user_id = Column(String, primary_key=True)
    project = Column(String)
    scope = Column(String)
    id_token = Column(String)
    refresh_token = Column(String)


class Database:
    def __init__(self, user='credmgr', password='credmgr', database='credmgr'):
        # Connecting to PostgreSQL server at localhost using psycopg2 DBAPI
        self.db = create_engine("postgresql+psycopg2://{}:{}@database/{}".format(user, password, database))
        Session = sessionmaker(self.db)
        self.session = Session()
        Base.metadata.create_all(self.db)
        self.log = logging.getLogger(LOGGER)

    def create_tokens(self, user_id, token, project="all", scope="all"):
        try:
            # Create
            self.log.debug("user_id = {}".format(user_id))
            id_token_string = token.get('id_token')
            self.log.debug("id_token: " + id_token_string)
            refresh_token_string = token.get('refresh_token')
            self.log.debug("refresh_token: " + refresh_token_string)

            id_obj = IdTokens(user_id=user_id, project=project, scope=scope, id_token= id_token_string,
                              refresh_token=refresh_token_string)
            self.session.add(id_obj)
            self.session.commit()
        except Exception as e:
            self.log.error("Exception occurred " + str(e))
            raise Exception(e)

    def read_tokens(self, user_id):
        # Read
        try:
            id_token = self.session.query(IdTokens).filter(IdTokens.user_id==user_id).all()
            if id_token is None or len(id_token) != 1:
                raise Exception("Token not found for user_id {}".format(user_id))
            return id_token[0]
        except Exception as e:
            self.log.error("Exception occurred " + str(e))
            raise Exception(e)

    def delete_tokens(self, token):
        # Delete
        try:
            self.session.delete(token)
            self.session.commit()
        except Exception as e:
            self.log.error("Exception occurred " + str(e))
            raise Exception(e)

