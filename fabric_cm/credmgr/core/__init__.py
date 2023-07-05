from fabric_cm.credmgr.logging import LOG

from fabric_cm.credmgr.config import CONFIG_OBJ

from fabric_cm.db.db_api import DbApi

DB_OBJ = DbApi(database=CONFIG_OBJ.get_database_name(), user=CONFIG_OBJ.get_database_user(),
               password=CONFIG_OBJ.get_database_password(), db_host=CONFIG_OBJ.get_database_host(),
               logger=LOG)
DB_OBJ.create_db()