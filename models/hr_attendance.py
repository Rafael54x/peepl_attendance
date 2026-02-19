# -*- coding: utf-8 -*-

from odoo import models, fields, api
from datetime import datetime, time
import pytz


class HrAttendance(models.Model):
    _inherit = 'hr.attendance'

    attendance_type = fields.Selection([
        ('present', 'Present'),
        ('late', 'Late Arrival'),
        ('sick', 'Sick Leave'),
        ('unpaid', 'Unpaid Leave'),
    ], string='Attendance Type', default='present')

    display_name = fields.Char(compute='_compute_display_name')

    @api.depends('attendance_type', 'check_in', 'check_out', 'worked_hours')
    def _compute_display_name(self):
        for record in self:
            if record.attendance_type in ['sick', 'unpaid']:
                record.display_name = dict(record._fields['attendance_type'].selection).get(record.attendance_type)
            else:
                user_tz = pytz.timezone(record.env.user.tz or 'UTC')
                check_in_str = pytz.utc.localize(record.check_in).astimezone(user_tz).strftime('%H:%M') if record.check_in else ''
                check_out_str = pytz.utc.localize(record.check_out).astimezone(user_tz).strftime('%H:%M') if record.check_out else ''
                hours = int(record.worked_hours)
                minutes = int((record.worked_hours - hours) * 60)
                record.display_name = f"{hours}h {minutes}m({check_in_str} - {check_out_str})" if check_in_str else '0h 0m'

    worked_hours = fields.Float(compute='_compute_worked_hours', store=True)

    @api.depends('check_in', 'check_out', 'attendance_type')
    def _compute_worked_hours(self):
        for attendance in self:
            if attendance.attendance_type in ['sick', 'unpaid']:
                attendance.worked_hours = 0.0
            elif attendance.check_out and attendance.check_in:
                delta = attendance.check_out - attendance.check_in
                attendance.worked_hours = delta.total_seconds() / 3600.0
            else:
                attendance.worked_hours = 0.0

    color = fields.Integer(compute='_compute_color', store=True)

    @api.depends('attendance_type')
    def _compute_color(self):
        for record in self:
            if record.attendance_type in ['sick', 'unpaid']:
                record.color = 1  # red
            elif record.attendance_type == 'late':
                record.color = 3  # yellow
            else:
                record.color = 10  # green

    @api.onchange('check_in')
    def _onchange_check_in(self):
        if self.check_in and self.attendance_type not in ['sick', 'unpaid']:
            user_tz = pytz.timezone(self.env.user.tz or 'UTC')
            check_in_local = pytz.utc.localize(self.check_in).astimezone(user_tz)
            if check_in_local.time() >= time(8, 1):
                self.attendance_type = 'late'
            else:
                self.attendance_type = 'present'

    @api.onchange('attendance_type')
    def _onchange_attendance_type(self):
        if self.attendance_type in ['sick', 'unpaid']:
            user_tz = pytz.timezone(self.env.user.tz or 'UTC')
            if self.check_in:
                local_date = pytz.utc.localize(self.check_in).astimezone(user_tz).date()
            else:
                local_date = datetime.now(user_tz).date()
            
            local_check_in = user_tz.localize(datetime.combine(local_date, time(8, 0)))
            local_check_out = user_tz.localize(datetime.combine(local_date, time(17, 0)))
            
            self.check_in = local_check_in.astimezone(pytz.utc).replace(tzinfo=None)
            self.check_out = local_check_out.astimezone(pytz.utc).replace(tzinfo=None)

    def _check_late_arrival(self):
        """Check if attendance should be marked as late based on check_in time"""
        user_tz = pytz.timezone(self.env.user.tz or 'UTC')
        for record in self:
            if record.check_in and record.attendance_type not in ['sick', 'unpaid']:
                check_in_local = pytz.utc.localize(record.check_in).astimezone(user_tz)
                if check_in_local.time() >= time(8, 1):
                    record.attendance_type = 'late'
                elif record.attendance_type == 'late' and check_in_local.time() < time(8, 1):
                    record.attendance_type = 'present'

    @api.model_create_multi
    def create(self, vals_list):
        user_tz = pytz.timezone(self.env.user.tz or 'UTC')
        for vals in vals_list:
            if vals.get('attendance_type') in ['sick', 'unpaid']:
                if not vals.get('check_in'):
                    local_date = datetime.now(user_tz).date()
                    local_check_in = user_tz.localize(datetime.combine(local_date, time(8, 0)))
                    local_check_out = user_tz.localize(datetime.combine(local_date, time(17, 0)))
                    vals['check_in'] = local_check_in.astimezone(pytz.utc).replace(tzinfo=None)
                    vals['check_out'] = local_check_out.astimezone(pytz.utc).replace(tzinfo=None)
            elif vals.get('check_in') and not vals.get('attendance_type'):
                check_in_utc = fields.Datetime.from_string(vals['check_in'])
                check_in_local = pytz.utc.localize(check_in_utc).astimezone(user_tz)
                if check_in_local.time() >= time(8, 1):
                    vals['attendance_type'] = 'late'
                else:
                    vals['attendance_type'] = 'present'
        return super().create(vals_list)

    def write(self, vals):
        result = super().write(vals)
        if 'check_in' in vals or 'check_out' in vals:
            self._check_late_arrival()
        return result
