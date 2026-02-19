/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

class HrAttendanceAnalytics extends Component {
    static template = "peepl_attendance.HrAttendanceAnalytics";

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            loading: true,
            data: {
                present: { value: "0%", list: [] },
                late: { value: "0%", list: [] },
                sick: { value: "0%", list: [] },
                unpaid: { value: "0%", list: [] },
            }
        });

        onWillStart(async () => {
            await this.loadData();
        });
    }

    async loadData() {
        const attendances = await this.orm.searchRead(
            "hr.attendance",
            [],
            ["employee_id", "attendance_type", "worked_hours"]
        );

        // Group by employee
        const empMap = {};
        attendances.forEach(att => {
            const empId = att.employee_id[0];
            const empName = att.employee_id[1];
            const type = att.attendance_type || "present";
            
            if (!empMap[empId]) {
                empMap[empId] = {
                    name: empName,
                    present: 0,
                    late: 0,
                    sick: 0,
                    unpaid: 0,
                    total: 0
                };
            }
            
            empMap[empId][type]++;
            empMap[empId].total++;
        });

        // Calculate percentages
        const grouped = {
            present: [],
            late: [],
            sick: [],
            unpaid: []
        };

        Object.values(empMap).forEach(emp => {
            if (emp.total > 0) {
                const presentPct = ((emp.present / emp.total) * 100).toFixed(1);
                const latePct = ((emp.late / emp.total) * 100).toFixed(1);
                const sickPct = ((emp.sick / emp.total) * 100).toFixed(1);
                const unpaidPct = ((emp.unpaid / emp.total) * 100).toFixed(1);

                if (emp.present > 0) {
                    grouped.present.push({ name: emp.name, dept: "Department", pct: presentPct });
                }
                if (emp.late > 0) {
                    grouped.late.push({ name: emp.name, dept: "Department", pct: latePct });
                }
                if (emp.sick > 0) {
                    grouped.sick.push({ name: emp.name, dept: "Department", pct: sickPct });
                }
                if (emp.unpaid > 0) {
                    grouped.unpaid.push({ name: emp.name, dept: "Department", pct: unpaidPct });
                }
            }
        });

        // Calculate overall percentages
        const totalAttendances = attendances.length;
        Object.keys(grouped).forEach(type => {
            const count = attendances.filter(a => (a.attendance_type || "present") === type).length;
            const pct = totalAttendances > 0 ? ((count / totalAttendances) * 100).toFixed(2) : "0.00";
            
            const list = grouped[type]
                .sort((a, b) => b.pct - a.pct)
                .slice(0, 8);

            this.state.data[type] = { value: pct + "%", list };
        });

        this.state.loading = false;
    }
}

registry.category("actions").add("hr_attendance_analytics", HrAttendanceAnalytics);
