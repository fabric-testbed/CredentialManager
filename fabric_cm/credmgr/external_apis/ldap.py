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
import re
import threading

from ldap3 import Connection, Server, ALL

from fabric_cm.credmgr.config import CONFIG_OBJ
from fabric_cm.credmgr.logging import LOG

"""
Handle LDAP interaction to get roles for a user
"""


class CmLdapMgr:
    def __init__(self):
        self.lock = threading.Lock()
        self.ldap_host = CONFIG_OBJ.get_ldap_host()
        self.ldap_user = CONFIG_OBJ.get_ldap_user()
        self.ldap_password = CONFIG_OBJ.get_ldap_pwd()
        self.ldap_search_base = CONFIG_OBJ.get_ldap_search_base()

        self.project_ignore_list = CONFIG_OBJ.get_project_ignore_list()
        self.roles_list = CONFIG_OBJ.get_roles()

        self.server = Server(host=self.ldap_host, use_ssl=True, get_info=ALL)

    def get_project_and_roles(self, eppn: str, email: str, project_id: str) -> (list, list):
        """
        Return active projects for a user identified by eppn or email
        @params eppn: eppn
        @params email: user email
        @params project_id: project id
        @return tuple of roles and project tags(always empty) as tags are not in CoManage
        """
        if eppn:
            ldap_search_filter = '(eduPersonPrincipalName=' + eppn + ')'
        else:
            ldap_search_filter = '(mail=' + email + ')'
        LOG.debug("ldap_host:%s", self.ldap_host)
        LOG.debug("ldap_user:%s", self.ldap_user)
        LOG.debug("ldap_password:%s", self.ldap_password)
        LOG.debug("ldap_search_base:%s", self.ldap_search_base)
        LOG.debug("ldap_search_filter:%s", ldap_search_filter)
        try:
            self.lock.acquire()
            conn = Connection(self.server, self.ldap_user, self.ldap_password, auto_bind=True)
            profile_found = conn.search(self.ldap_search_base,
                                        ldap_search_filter,
                                        attributes=[
                                            'isMemberOf',
                                        ])
            if profile_found:
                attributes = conn.entries[0]['isMemberOf']
                attributes = [attr for attr in attributes if 'active' in attr]
            else:
                attributes = None
            conn.unbind()
        finally:
            self.lock.release()
        LOG.debug(attributes)
        # CoMange doesn't have project tags; so always return empty list
        project_tags = []
        roles = None
        belongs_to_project = False
        if attributes is not None:
            roles = []
            for a in attributes:
                m = re.match('CO:COU:(.+?):members:active', a)
                if m:
                    found = m.group(1)
                    if found not in self.project_ignore_list:
                        if found in self.roles_list or "-po" in found or "-pm" in found:
                            roles.append(found)
                        if project_id in found:
                            belongs_to_project = True

            if not belongs_to_project:
                raise Exception("User is not a member of project: " + project_id)

        LOG.debug("Project Tags: %s, Roles: %s", project_tags, roles)
        return roles, project_tags


class CmLdapMgrSingleton:
    """
    CmLdapMgr Singleton class
    """
    __instance = None

    def __init__(self):
        if self.__instance is not None:
            raise Exception("Singleton can't be created twice !")

    def get(self):
        """
        Actually create an instance
        """
        if self.__instance is None:
            self.__instance = CmLdapMgr()
        return self.__instance

    get = classmethod(get)
