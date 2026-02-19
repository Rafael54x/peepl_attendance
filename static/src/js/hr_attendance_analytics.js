/** @odoo-module **/

import { Component, useState, onWillStart, onMounted, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

class HrAttendanceAnalytics extends Component {
    static template = "peepl_attendance.HrAttendanceAnalytics";

    setup() {
        this.orm = useService("orm");
        this.summaryRefs = {
            present: useRef("presentValue"),
            late: useRef("lateValue"),
            sick: useRef("sickValue"),
            unpaid: useRef("unpaidValue")
        };
        this.state = useState({
            loading: true,
            filter: "month",
            startDate: this.getDefaultStartDate("month"),
            endDate: this.getDefaultEndDate(),
            collapsedCards: {},
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

        onMounted(() => {
            this.animateCounters();
        });
    }

    getDefaultStartDate(filter) {
        const now = new Date();
        switch(filter) {
            case "day":
                return now.toISOString().split('T')[0];
            case "week":
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() - now.getDay());
                return weekStart.toISOString().split('T')[0];
            case "month":
                return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            case "quarter":
                const quarter = Math.floor(now.getMonth() / 3);
                return new Date(now.getFullYear(), quarter * 3, 1).toISOString().split('T')[0];
            case "year":
                return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
            default:
                return now.toISOString().split('T')[0];
        }
    }

    getDefaultEndDate() {
        return new Date().toISOString().split('T')[0];
    }

    onFilterChange(ev) {
        this.state.filter = ev.target.value;
        this.state.startDate = this.getDefaultStartDate(this.state.filter);
        this.state.endDate = this.getDefaultEndDate();
        this.validateDateRange();
        this.loadData();
    }

    onDateChange() {
        this.validateDateRange();
        this.loadData();
    }

    validateDateRange() {
        const start = new Date(this.state.startDate);
        const end = new Date(this.state.endDate);
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

        let maxDays;
        switch(this.state.filter) {
            case "day":
                maxDays = 1;
                break;
            case "week":
                maxDays = 7;
                break;
            case "month":
                maxDays = 31;
                break;
            case "quarter":
                maxDays = 92;
                break;
            case "year":
                maxDays = 365;
                break;
            default:
                maxDays = 365;
        }

        if (diffDays > maxDays) {
            const newEnd = new Date(start);
            newEnd.setDate(start.getDate() + maxDays);
            this.state.endDate = newEnd.toISOString().split('T')[0];
        }
    }

    async loadData() {
        this.state.loading = true;
        
        const domain = [
            ["check_in", ">=", this.state.startDate + " 00:00:00"],
            ["check_in", "<=", this.state.endDate + " 23:59:59"]
        ];

        const attendances = await this.orm.searchRead(
            "hr.attendance",
            domain,
            ["employee_id", "attendance_type", "worked_hours"]
        );

        // Get employee departments
        const employeeIds = [...new Set(attendances.map(a => a.employee_id[0]))];
        const employees = await this.orm.searchRead(
            "hr.employee",
            [["id", "in", employeeIds]],
            ["id", "department_id"]
        );
        
        const empDeptMap = {};
        employees.forEach(emp => {
            empDeptMap[emp.id] = emp.department_id ? emp.department_id[1] : "No Department";
        });

        // Group by employee
        const empMap = {};
        attendances.forEach(att => {
            const empId = att.employee_id[0];
            const empName = att.employee_id[1];
            const type = att.attendance_type || "present";
            
            if (!empMap[empId]) {
                empMap[empId] = {
                    name: empName,
                    dept: empDeptMap[empId] || "No Department",
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
                    grouped.present.push({ name: emp.name, dept: emp.dept, pct: presentPct });
                }
                if (emp.late > 0) {
                    grouped.late.push({ name: emp.name, dept: emp.dept, pct: latePct });
                }
                if (emp.sick > 0) {
                    grouped.sick.push({ name: emp.name, dept: emp.dept, pct: sickPct });
                }
                if (emp.unpaid > 0) {
                    grouped.unpaid.push({ name: emp.name, dept: emp.dept, pct: unpaidPct });
                }
            }
        });

        // Calculate overall percentages
        Object.keys(grouped).forEach(type => {
            const list = grouped[type]
                .sort((a, b) => b.pct - a.pct)
                .slice(0, 10);

            const totalPct = list.reduce((sum, emp) => sum + parseFloat(emp.pct), 0);
            const avgPct = list.length > 0 ? (totalPct / list.length).toFixed(2) : "0.00";

            this.state.data[type] = { value: avgPct + "%", list };
        });

        this.state.loading = false;
        this.animateCounters();
    }

    animateCounters() {
        Object.keys(this.summaryRefs).forEach(type => {
            const ref = this.summaryRefs[type];
            if (ref.el) {
                const target = parseFloat(this.state.data[type].value);
                this.animateValue(ref.el, 0, target, 1000);
            }
        });
    }

    animateValue(element, start, end, duration) {
        const startTime = performance.now();
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const value = start + (end - start) * this.easeOutQuart(progress);
            element.textContent = value.toFixed(2) + "%";
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    }

    easeOutQuart(x) {
        return 1 - Math.pow(1 - x, 4);
    }

    toggleCard(type) {
        this.state.collapsedCards[type] = !this.state.collapsedCards[type];
    }
}

registry.category("actions").add("hr_attendance_analytics", HrAttendanceAnalytics);
