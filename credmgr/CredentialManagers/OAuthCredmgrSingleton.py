from credmgr.CredentialManagers import OAuthCredmgr
from credmgr.utils import get_cred_dir, setup_logging


class OAuthCredmgrSingleton:
    __instance = None

    def __init__(self):
        if self.__instance is not None:
            raise Exception("Singleton can't be created twice !")

    def get(self):
        """
        Actually create an instance
        """
        if self.__instance is None:
            self.cred_dir = get_cred_dir()
            self.log = setup_logging()
            self.__instance = OAuthCredmgr(self.cred_dir)
            self.log.debug("OAuthCredmgrSingleton initialised")
        return self.__instance

    get = classmethod(get)