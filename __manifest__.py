# -*- coding: utf-8 -*-
{
    'name': 'Peepl Attendance - Attendance',
    'version': '19.0.1.0.8',
    'category': 'Attendance/Projects',
    'summary': 'Attendance Services',
    'description': """
Attendance System
==================================

    """,
    'author': 'Peepl',
    'website': 'https://peepl.tech',
    'license': 'LGPL-3',
    'depends': ['base', 'hr_attendance'],
    'data': [
        'views/hr_attendance_view.xml',
        'views/hr_attendance_menu.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'peepl_attendance/static/src/js/hr_attendance_analytics.js',
            'peepl_attendance/static/src/xml/hr_attendance_analytics.xml',
            'peepl_attendance/static/src/css/hr_attendance_analytics.css',
        ],
    },
    'demo': [],
    'installable': True,
    'auto_install': False,
    'application': False,

    'uninstall_hook': None,
    'external_dependencies': {
        'python': [],
    },
}