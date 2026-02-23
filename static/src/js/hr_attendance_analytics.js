/** @odoo-module **/

import { Component, useState, onWillStart, onMounted, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadJS } from "@web/core/assets";

class HrAttendanceAnalytics extends Component {
    static template = "peepl_attendance.HrAttendanceAnalytics";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.summaryRefs = {
            attendance: useRef("attendanceValue"),
            late: useRef("lateValue"),
            sick: useRef("sickValue"),
            unpaid: useRef("unpaidValue")
        };
        this.chartRef = useRef("pieChart");
        this.barChartRef = useRef("barChart");
        this.state = useState({
            loading: true,
            filter: "year",
            startDate: new Date().getFullYear() + "-01-01",
            endDate: new Date().getFullYear() + "-12-31",
            selectedYear: new Date().getFullYear(),
            selectedMonth: new Date().getMonth() + 1,
            selectedQuarter: Math.floor(new Date().getMonth() / 3) + 1,
            collapsedCards: {},
            view: "dashboard",
            selectedEmployee: null,
            employeeData: null,
            detailFilter: "all",
            detailStartDate: "",
            detailEndDate: "",
            detailSelectedYear: new Date().getFullYear(),
            detailSelectedMonth: new Date().getMonth() + 1,
            detailSelectedQuarter: Math.floor(new Date().getMonth() / 3) + 1,
            detailStatusFilter: "all",
            currentPage: 1,
            pageSize: 20,
            data: {
                attendance: { value: "0%" },
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
            this.renderChart();
            this.renderBarChart();
        });
    }

    getDefaultStartDate(filter) {
        const now = new Date();
        switch(filter) {
            case "day":
                return now.toISOString().split('T')[0];
            case "week":
                const weekEnd = new Date(now);
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() - 6);
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

    onFilterChange(ev) {
        this.state.filter = ev.target.value;
        const now = new Date();
        const year = this.state.selectedYear;
        const month = this.state.selectedMonth;
        const quarter = this.state.selectedQuarter;
        
        if (this.state.filter === 'year') {
            this.state.startDate = year + "-01-01";
            this.state.endDate = year + "-12-31";
        } else if (this.state.filter === 'month') {
            const monthStr = String(month).padStart(2, '0');
            const lastDay = new Date(year, month, 0).getDate();
            this.state.startDate = `${year}-${monthStr}-01`;
            this.state.endDate = `${year}-${monthStr}-${lastDay}`;
        } else if (this.state.filter === 'quarter') {
            const startMonth = (quarter - 1) * 3 + 1;
            const endMonth = startMonth + 2;
            const lastDay = new Date(year, endMonth, 0).getDate();
            this.state.startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
            this.state.endDate = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
        } else if (this.state.filter === 'day') {
            this.state.startDate = now.toISOString().split('T')[0];
            this.state.endDate = now.toISOString().split('T')[0];
        } else if (this.state.filter === 'week') {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - 6);
            this.state.startDate = weekStart.toISOString().split('T')[0];
            this.state.endDate = now.toISOString().split('T')[0];
        }
        
        this.loadData();
    }

    onDetailYearChange() {
        this.state.detailStartDate = this.state.detailSelectedYear + "-01-01";
        this.state.detailEndDate = this.state.detailSelectedYear + "-12-31";
        this.filterEmployeeAttendances();
    }

    onMonthChange() {
        const year = this.state.selectedYear;
        const month = String(this.state.selectedMonth).padStart(2, '0');
        const lastDay = new Date(year, this.state.selectedMonth, 0).getDate();
        this.state.startDate = `${year}-${month}-01`;
        this.state.endDate = `${year}-${month}-${lastDay}`;
        this.loadData();
    }

    onQuarterChange() {
        const year = this.state.selectedYear;
        const quarter = this.state.selectedQuarter;
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        const lastDay = new Date(year, endMonth, 0).getDate();
        this.state.startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
        this.state.endDate = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
        this.loadData();
    }

    onDayChange() {
        this.state.endDate = this.state.startDate;
        this.loadData();
    }

    onDetailDayChange() {
        this.state.detailEndDate = this.state.detailStartDate;
        this.filterEmployeeAttendances();
    }

    onDetailMonthChange() {
        const year = this.state.detailSelectedYear;
        const month = String(this.state.detailSelectedMonth).padStart(2, '0');
        const lastDay = new Date(year, this.state.detailSelectedMonth, 0).getDate();
        this.state.detailStartDate = `${year}-${month}-01`;
        this.state.detailEndDate = `${year}-${month}-${lastDay}`;
        this.filterEmployeeAttendances();
    }

    onDetailQuarterChange() {
        const year = this.state.detailSelectedYear;
        const quarter = this.state.detailSelectedQuarter;
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        const lastDay = new Date(year, endMonth, 0).getDate();
        this.state.detailStartDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
        this.state.detailEndDate = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
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

    renderChart() {
        if (!this.chartRef.el) return;

        const ctx = this.chartRef.el.getContext('2d');
        const container = this.chartRef.el.parentElement;
        
        if (this.chart) {
            this.chart.destroy();
        }

        // Get data from summary cards (exclude present)
        const latePct = parseFloat(this.state.data.late.value);
        const sickPct = parseFloat(this.state.data.sick.value);
        const unpaidPct = parseFloat(this.state.data.unpaid.value);

        const hasData = latePct > 0 || sickPct > 0 || unpaidPct > 0;

        // Remove existing no-data message
        const existingMsg = container.querySelector('.no-data-message');
        if (existingMsg) existingMsg.remove();

        if (!hasData) {
            const noDataDiv = document.createElement('div');
            noDataDiv.className = 'no-data-message';
            noDataDiv.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #6c757d; font-size: 14px;';
            noDataDiv.textContent = 'No data available';
            container.style.position = 'relative';
            container.appendChild(noDataDiv);
            return;
        }

        this.chart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Late Arrival', 'Sick Leave', 'Unpaid Leave'],
                datasets: [{
                    data: [latePct, sickPct, unpaidPct],
                    backgroundColor: [
                        '#d97706',
                        '#ea580c',
                        '#dc2626'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: {
                                size: 12,
                                weight: '500'
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                return label + ': ' + value.toFixed(2) + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    onDateChange() {
        this.validateDateRange();
        this.loadData();
    }

    onWeekChange() {
        const weekStart = new Date(this.state.startDate);
        weekStart.setDate(weekStart.getDate() - 6);
        this.state.startDate = weekStart.toISOString().split('T')[0];
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

        // Calculate total attendance by type
        const totalStats = {
            present: 0,
            late: 0,
            sick: 0,
            unpaid: 0,
            total: attendances.length
        };

        attendances.forEach(att => {
            const type = att.attendance_type || "present";
            totalStats[type]++;
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
                // For present: calculate (present + late) / total
                const presentPct = (((emp.present + emp.late) / emp.total) * 100).toFixed(1);
                const latePct = ((emp.late / emp.total) * 100).toFixed(1);
                const sickPct = ((emp.sick / emp.total) * 100).toFixed(1);
                const unpaidPct = ((emp.unpaid / emp.total) * 100).toFixed(1);

                // Show in present list if employee has present or late attendance
                if (emp.present > 0 || emp.late > 0) {
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

        // Set data with total percentage and top 10 list
        Object.keys(grouped).forEach(type => {
            const list = grouped[type]
                .sort((a, b) => b.pct - a.pct)
                .slice(0, 10);

            const totalPct = totalStats.total > 0 ? ((totalStats[type] / totalStats.total) * 100).toFixed(2) : "0.00";

            this.state.data[type] = { value: totalPct + "%", list };
        });

        // Calculate attendance (present + late)
        const attendancePct = totalStats.total > 0 ? (((totalStats.present + totalStats.late) / totalStats.total) * 100).toFixed(2) : "0.00";
        this.state.data.attendance = { value: attendancePct + "%" };

        this.state.loading = false;
        this.animateCounters();
        setTimeout(() => {
            this.renderChart();
            this.renderBarChart();
        }, 50);
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
            unpaid: 0,
            total: attendances.length
        };

        attendances.forEach(att => {
            const type = att.attendance_type || "present";
            stats[type]++;
        });

        // Calculate percentages
        stats.presentPct = stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) : "0.0";
        stats.latePct = stats.total > 0 ? ((stats.late / stats.total) * 100).toFixed(1) : "0.0";
        stats.sickPct = stats.total > 0 ? ((stats.sick / stats.total) * 100).toFixed(1) : "0.0";
        stats.unpaidPct = stats.total > 0 ? ((stats.unpaid / stats.total) * 100).toFixed(1) : "0.0";

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
        setTimeout(() => {
            this.renderChart();
            this.renderBarChart();
        }, 100);
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
        const now = new Date();
        const year = this.state.detailSelectedYear;
        const month = this.state.detailSelectedMonth;
        const quarter = this.state.detailSelectedQuarter;
        
        if (this.state.detailFilter === 'year') {
            this.state.detailStartDate = year + "-01-01";
            this.state.detailEndDate = year + "-12-31";
        } else if (this.state.detailFilter === 'month') {
            const monthStr = String(month).padStart(2, '0');
            const lastDay = new Date(year, month, 0).getDate();
            this.state.detailStartDate = `${year}-${monthStr}-01`;
            this.state.detailEndDate = `${year}-${monthStr}-${lastDay}`;
        } else if (this.state.detailFilter === 'quarter') {
            const startMonth = (quarter - 1) * 3 + 1;
            const endMonth = startMonth + 2;
            const lastDay = new Date(year, endMonth, 0).getDate();
            this.state.detailStartDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
            this.state.detailEndDate = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
        } else if (this.state.detailFilter === 'day') {
            this.state.detailStartDate = now.toISOString().split('T')[0];
            this.state.detailEndDate = now.toISOString().split('T')[0];
        } else if (this.state.detailFilter === 'week') {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - 6);
            this.state.detailStartDate = weekStart.toISOString().split('T')[0];
            this.state.detailEndDate = now.toISOString().split('T')[0];
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
            unpaid: 0,
            total: filtered.length
        };

        filtered.forEach(att => {
            const type = att.attendance_type || "present";
            stats[type]++;
        });

        // Calculate percentages
        stats.presentPct = stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(1) : "0.0";
        stats.latePct = stats.total > 0 ? ((stats.late / stats.total) * 100).toFixed(1) : "0.0";
        stats.sickPct = stats.total > 0 ? ((stats.sick / stats.total) * 100).toFixed(1) : "0.0";
        stats.unpaidPct = stats.total > 0 ? ((stats.unpaid / stats.total) * 100).toFixed(1) : "0.0";

        this.state.employeeData.attendances = filtered;
        this.state.employeeData.filteredAttendances = filtered;
        this.state.employeeData.stats = stats;
        this.state.currentPage = 1;
    }

    renderBarChart() {
        if (!this.barChartRef.el) return;

        const ctx = this.barChartRef.el.getContext('2d');
        const container = this.barChartRef.el.parentElement;
        
        if (this.barChart) {
            this.barChart.destroy();
        }

        const topPerformers = this.state.data.present.list
            .sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct))
            .slice(0, 10);

        // Remove existing no-data message
        const existingMsg = container.querySelector('.no-data-message');
        if (existingMsg) existingMsg.remove();

        if (topPerformers.length === 0) {
            const noDataDiv = document.createElement('div');
            noDataDiv.className = 'no-data-message';
            noDataDiv.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #6c757d; font-size: 14px;';
            noDataDiv.textContent = 'No data available';
            container.style.position = 'relative';
            container.appendChild(noDataDiv);
            return;
        }

        this.barChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: topPerformers.map(emp => emp.name),
                datasets: [{
                    label: 'Present Rate (%)',
                    data: topPerformers.map(emp => parseFloat(emp.pct)),
                    backgroundColor: '#059669',
                    borderRadius: 8
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const emp = topPerformers[index];
                        this.viewEmployeeDetail(emp.id, emp.name);
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.parsed.x.toFixed(1) + '%';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        },
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: {
                                size: 11
                            }
                        }
                    }
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                }
            }
        });
    }
}

registry.category("actions").add("hr_attendance_analytics", HrAttendanceAnalytics);

