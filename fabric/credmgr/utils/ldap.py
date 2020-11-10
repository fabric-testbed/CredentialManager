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
from ldap3 import Connection, Server, ALL

from fabric.credmgr import CONFIG
from fabric.credmgr.utils import LOG

"""
Handle LDAP interaction to get roles for a user
"""

ldap_host = CONFIG.get('ldap', 'ldap-host')
ldap_user = CONFIG.get('ldap', 'ldap-user')
ldap_password = CONFIG.get('ldap', 'ldap-password')
ldap_search_base = CONFIG.get('ldap', 'ldap-search-base')

server = Server(ldap_host, use_ssl=True, get_info=ALL)


def get_active_projects_from_ldap(eppn, email):
    """
    Return active projects for a user identified by eppn or email
    @params eppn: eppn
    @params email: user email

    @return list of active projects for user
    """
    if eppn:
        ldap_search_filter = '(eduPersonPrincipalName=' + eppn + ')'
    else:
        ldap_search_filter = '(mail=' + email + ')'
    LOG.debug("ldap_host:%s", ldap_host)
    LOG.debug("ldap_user:%s", ldap_user)
    LOG.debug("ldap_password:%s", ldap_password)
    LOG.debug("ldap_search_base:%s", ldap_search_base)
    LOG.debug("ldap_search_filter:%s", ldap_search_filter)
    conn = Connection(server, ldap_user, ldap_password, auto_bind=True)
    profile_found = conn.search(ldap_search_base,
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
    LOG.debug(attributes)
    return attributes
