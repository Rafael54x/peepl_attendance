/** @odoo-module **/

import { Component, useState, onWillStart, onMounted, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

class HrAttendanceAnalytics extends Component {
    static template = "peepl_attendance.HrAttendanceAnalytics";
    static props = ["*"];

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
            filter: "year",
            startDate: new Date().getFullYear() + "-01-01",
            endDate: new Date().getFullYear() + "-12-31",
            selectedYear: new Date().getFullYear(),
            collapsedCards: {},
            view: "dashboard",
            selectedEmployee: null,
            employeeData: null,
            detailFilter: "all",
            detailStartDate: "",
            detailEndDate: "",
            detailSelectedYear: new Date().getFullYear(),
            detailStatusFilter: "all",
            currentPage: 1,
            pageSize: 20,
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
        if (this.state && this.state.filter === 'year') {
            const year = this.state.selectedYear || new Date().getFullYear();
            return year + '-12-31';
        }
        return new Date().toISOString().split('T')[0];
    }

    getYearOptions() {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = currentYear; i >= currentYear - 10; i--) {
            years.push(i);
        }
        return years;
    }

    onYearChange() {
        this.state.startDate = this.state.selectedYear + "-01-01";
        this.state.endDate = this.state.selectedYear + "-12-31";
        this.loadData();
    }

    onDetailYearChange() {
        this.state.detailStartDate = this.state.detailSelectedYear + "-01-01";
        this.state.detailEndDate = this.state.detailSelectedYear + "-12-31";
        this.filterEmployeeAttendances();
    }

    onDayChange() {
        this.state.endDate = this.state.startDate;
        this.loadData();
    }

    onDetailDayChange() {
        this.state.detailEndDate = this.state.detailStartDate;
        this.filterEmployeeAttendances();
    }

    onDetailStatusFilterChange(ev) {
        this.state.detailStatusFilter = ev.target.value;
        this.state.currentPage = 1;
        this.filterEmployeeAttendances();
    }

    onPageSizeChange(ev) {
        this.state.pageSize = parseInt(ev.target.value);
        this.state.currentPage = 1;
    }

    nextPage() {
        const totalPages = Math.ceil(this.state.employeeData.filteredAttendances.length / this.state.pageSize);
        if (this.state.currentPage < totalPages) {
            this.state.currentPage++;
        }
    }

    prevPage() {
        if (this.state.currentPage > 1) {
            this.state.currentPage--;
        }
    }

    getPaginatedAttendances() {
        const start = (this.state.currentPage - 1) * this.state.pageSize;
        const end = start + this.state.pageSize;
        return this.state.employeeData.filteredAttendances.slice(start, end);
    }

    getTotalPages() {
        return Math.ceil(this.state.employeeData.filteredAttendances.length / this.state.pageSize);
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
                    id: empId,
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
            const empId = Object.keys(empMap).find(key => empMap[key] === emp);
            if (emp.total > 0) {
                const presentPct = ((emp.present / emp.total) * 100).toFixed(1);
                const latePct = ((emp.late / emp.total) * 100).toFixed(1);
                const sickPct = ((emp.sick / emp.total) * 100).toFixed(1);
                const unpaidPct = ((emp.unpaid / emp.total) * 100).toFixed(1);

                if (emp.present > 0) {
                    grouped.present.push({ id: empId, name: emp.name, dept: emp.dept, pct: presentPct });
                }
                if (emp.late > 0) {
                    grouped.late.push({ id: empId, name: emp.name, dept: emp.dept, pct: latePct });
                }
                if (emp.sick > 0) {
                    grouped.sick.push({ id: empId, name: emp.name, dept: emp.dept, pct: sickPct });
                }
                if (emp.unpaid > 0) {
                    grouped.unpaid.push({ id: empId, name: emp.name, dept: emp.dept, pct: unpaidPct });
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

    async viewEmployeeDetail(empId, empName) {
        this.state.loading = true;
        this.state.view = "detail";
        this.state.selectedEmployee = { id: empId, name: empName };

        const domain = [
            ["employee_id", "=", parseInt(empId)]
        ];

        console.log("Fetching attendances for employee ID:", parseInt(empId));

        const attendances = await this.orm.searchRead(
            "hr.attendance",
            domain,
            ["id", "check_in", "check_out", "attendance_type"],
            { order: "check_in desc" }
        );

        console.log("Attendances fetched:", attendances);

        // Convert UTC to local timezone
        attendances.forEach(att => {
            if (att.check_in) {
                const checkInUTC = new Date(att.check_in + ' UTC');
                att.check_in = this.formatDateTime(checkInUTC);
            }
            if (att.check_out) {
                const checkOutUTC = new Date(att.check_out + ' UTC');
                att.check_out = this.formatDateTime(checkOutUTC);
            }
        });

        const stats = {
            present: 0,
            late: 0,
            sick: 0,
            unpaid: 0
        };

        attendances.forEach(att => {
            const type = att.attendance_type || "present";
            stats[type]++;
        });

        this.state.employeeData = {
            stats,
            attendances,
            allAttendances: attendances,
            filteredAttendances: attendances
        };

        this.state.loading = false;
    }

    backToDashboard() {
        this.state.view = "dashboard";
        this.state.selectedEmployee = null;
        this.state.employeeData = null;
    }

    formatDateTime(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    onDetailFilterChange(ev) {
        this.state.detailFilter = ev.target.value;
        if (this.state.detailFilter !== "all") {
            this.state.detailStartDate = this.getDefaultStartDate(this.state.detailFilter);
            this.state.detailEndDate = this.getDefaultEndDate();
        }
        this.filterEmployeeAttendances();
    }

    onDetailDateChange() {
        this.filterEmployeeAttendances();
    }

    filterEmployeeAttendances() {
        if (!this.state.employeeData || !this.state.employeeData.allAttendances) return;

        let filtered = this.state.employeeData.allAttendances;

        if (this.state.detailFilter !== "all" && this.state.detailStartDate && this.state.detailEndDate) {
            filtered = filtered.filter(att => {
                const attDate = att.check_in.split(' ')[0];
                return attDate >= this.state.detailStartDate && attDate <= this.state.detailEndDate;
            });
        }

        if (this.state.detailStatusFilter !== "all") {
            filtered = filtered.filter(att => {
                const type = att.attendance_type || "present";
                return type === this.state.detailStatusFilter;
            });
        }

        const stats = {
            present: 0,
            late: 0,
            sick: 0,
            unpaid: 0
        };

        filtered.forEach(att => {
            const type = att.attendance_type || "present";
            stats[type]++;
        });

        this.state.employeeData.attendances = filtered;
        this.state.employeeData.filteredAttendances = filtered;
        this.state.employeeData.stats = stats;
        this.state.currentPage = 1;
    }
}

registry.category("actions").add("hr_attendance_analytics", HrAttendanceAnalytics);
