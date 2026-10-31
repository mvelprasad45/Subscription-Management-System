(() => {
  const inrFormatter = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formatINR = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      throw new TypeError("INR formatting requires a finite number.");
    }
    return `₹${inrFormatter.format(amount)}`;
  };
  window.formatINR = formatINR;

  const body = document.body;
  const sidebarToggle = document.querySelector("[data-sidebar-toggle]");
  const sidebarClose = document.querySelector("[data-sidebar-close]");

  const setSidebarOpen = (open) => {
    body.classList.toggle("sidebar-open", open);
    if (sidebarToggle) {
      sidebarToggle.setAttribute("aria-expanded", String(open));
      sidebarToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    }
  };

  sidebarToggle?.addEventListener("click", () => {
    setSidebarOpen(!body.classList.contains("sidebar-open"));
  });
  sidebarClose?.addEventListener("click", () => setSidebarOpen(false));
  document.querySelectorAll(".primary-nav a").forEach((link) => {
    link.addEventListener("click", () => setSidebarOpen(false));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setSidebarOpen(false);
      closeNotifications();
    }
  });

  const notificationToggle = document.querySelector("[data-notification-toggle]");
  const notificationMenu = document.getElementById("notification-menu");
  const closeNotifications = () => {
    if (!notificationToggle || !notificationMenu) return;
    notificationMenu.hidden = true;
    notificationToggle.setAttribute("aria-expanded", "false");
  };

  notificationToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!notificationMenu) return;
    const opening = notificationMenu.hidden;
    notificationMenu.hidden = !opening;
    notificationToggle.setAttribute("aria-expanded", String(opening));
  });
  document.addEventListener("click", (event) => {
    if (notificationMenu && !notificationMenu.contains(event.target) && event.target !== notificationToggle) {
      closeNotifications();
    }
  });

  const reportSvgNamespace = "http://www.w3.org/2000/svg";
  const reportSvg = (tag, attributes = {}) => {
    const element = document.createElementNS(reportSvgNamespace, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  };
  const readReportData = (id) => {
    const element = document.getElementById(id);
    if (!element) return null;
    try {
      return JSON.parse(element.textContent);
    } catch (error) {
      console.error(`Could not read report data in ${id}.`, error);
      return null;
    }
  };
  const revenueChart = document.getElementById("report-revenue-chart");
  const reportRevenue = readReportData("report-revenue-data");
  if (revenueChart && Array.isArray(reportRevenue) && reportRevenue.length) {
    const width = 720;
    const height = 250;
    const left = 130;
    const right = 18;
    const top = 18;
    const bottom = 42;
    const plotHeight = height - top - bottom;
    const plotWidth = width - left - right;
    const maxValue = Math.max(...reportRevenue.map((item) => Number(item.total) || 0), 1);
    for (let tick = 0; tick <= 3; tick += 1) {
      const y = top + (plotHeight * tick) / 3;
      const line = reportSvg("line", { x1: left, y1: y, x2: width - right, y2: y, class: "report-grid-line" });
      const label = reportSvg("text", { x: left - 8, y: y + 3, class: "report-chart-label", "text-anchor": "end" });
      label.textContent = formatINR(maxValue * (1 - tick / 3));
      revenueChart.append(line, label);
    }
    const step = plotWidth / reportRevenue.length;
    const barWidth = Math.min(42, step * 0.58);
    reportRevenue.forEach((item, index) => {
      const value = Number(item.total) || 0;
      const barHeight = (value / maxValue) * (plotHeight - 8);
      const x = left + step * index + (step - barWidth) / 2;
      const y = top + plotHeight - barHeight;
      revenueChart.append(reportSvg("rect", {
        x, y, width: barWidth, height: Math.max(barHeight, 1), class: "report-chart-bar",
      }));
      const valueLabel = reportSvg("text", {
        x: x + barWidth / 2, y: Math.max(y - 6, top + 8), class: "report-chart-value", "text-anchor": "middle",
      });
      valueLabel.textContent = formatINR(value);
      const monthLabel = reportSvg("text", {
        x: x + barWidth / 2, y: height - 14, class: "report-chart-label", "text-anchor": "middle",
      });
      monthLabel.textContent = String(item.month).replace(/ \d{4}$/, "");
      const tooltip = reportSvg("title");
      tooltip.textContent = `${item.month}: ${formatINR(value)}`;
      revenueChart.append(valueLabel, monthLabel, tooltip);
    });
  }

  const drawReportBars = (chartId, dataId, money) => {
    const chart = document.getElementById(chartId);
    const data = readReportData(dataId);
    if (!chart || !data || typeof data !== "object") return;
    const entries = Object.entries(data);
    const width = 520;
    const left = 118;
    const right = 116;
    const rowHeight = 42;
    const max = Math.max(...entries.map(([, value]) => Number(value) || 0), 1);
    entries.forEach(([labelText, rawValue], index) => {
      const value = Number(rawValue) || 0;
      const y = 24 + index * rowHeight;
      const label = reportSvg("text", { x: left - 10, y: y + 13, class: "report-chart-label", "text-anchor": "end" });
      label.textContent = labelText;
      const bar = reportSvg("rect", {
        x: left, y, width: Math.max(((width - left - right) * value) / max, 1),
        height: 20, class: "report-chart-bar",
      });
      if (money) {
        const tooltip = reportSvg("title");
        tooltip.textContent = `${labelText}: ${formatINR(value)}`;
        bar.append(tooltip);
      }
      const valueText = reportSvg("text", {
        x: width - 4, y: y + 14, class: "report-chart-value", "text-anchor": "end",
      });
      valueText.textContent = money ? formatINR(value) : String(value);
      chart.append(label, bar, valueText);
    });
  };
  drawReportBars("report-invoice-chart", "report-invoice-data", false);
  drawReportBars("report-method-chart", "report-method-data", true);

  const quotationForm = document.getElementById("quotation-form");
  if (quotationForm) {
    const productSelect = document.getElementById("quotation-product");
    const planSelect = document.getElementById("quotation-plan");
    const quantityInput = document.getElementById("quotation-quantity");
    const planDataElement = document.getElementById("quotation-plan-data");
    let planData = {};
    try {
      planData = JSON.parse(planDataElement.textContent);
    } catch (error) {
      console.error("Could not read quotation plan data.", error);
    }

    const updatePlans = (selectedPlanId = planSelect.value) => {
      const productId = productSelect.value;
      Array.from(planSelect.options).forEach((option) => {
        if (!option.value) return;
        const matches = !productId || option.dataset.productId === productId;
        option.hidden = !matches;
        option.disabled = !matches;
      });
      if (selectedPlanId && planSelect.querySelector(`option[value="${selectedPlanId}"]`)?.disabled) {
        planSelect.value = "";
      }
      updateQuotationTotal();
    };

    const updateQuotationTotal = () => {
      const selectedPlan = planData[planSelect.value];
      const quantity = Math.max(Number.parseInt(quantityInput.value, 10) || 0, 0);
      const subtotal = selectedPlan ? Number(selectedPlan.price) * quantity : 0;
      const discount = subtotal * (Number(quotationForm.dataset.discountRate) || 0) / 100;
      const tax = (subtotal - discount) * (Number(quotationForm.dataset.taxRate) || 0) / 100;
      document.getElementById("quote-subtotal").textContent = formatINR(subtotal);
      document.getElementById("quote-tax").textContent = formatINR(tax);
      document.getElementById("quote-discount").textContent = `−${formatINR(discount)}`;
      document.getElementById("quote-total").textContent = formatINR(subtotal + tax - discount);
    };

    const selectedPlan = planData[planSelect.value];
    if (selectedPlan && !productSelect.value) {
      productSelect.value = String(selectedPlan.product_id);
    }
    productSelect.addEventListener("change", () => updatePlans(""));
    planSelect.addEventListener("change", () => {
      const plan = planData[planSelect.value];
      if (plan) productSelect.value = String(plan.product_id);
      updatePlans(planSelect.value);
    });
    quantityInput.addEventListener("input", updateQuotationTotal);
    updatePlans(planSelect.value);
  }

  const chart = document.getElementById("revenue-chart");
  const revenueData = document.getElementById("revenue-data");
  if (!chart || !revenueData) return;

  let months;
  try {
    months = JSON.parse(revenueData.textContent);
  } catch (error) {
    console.error("Could not read revenue chart data.", error);
    return;
  }
  if (!Array.isArray(months) || months.length === 0) return;

  const namespace = "http://www.w3.org/2000/svg";
  const createSvg = (tag, attributes = {}) => {
    const element = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  };
  const width = 720;
  const height = 230;
  const left = 120;
  const right = 12;
  const top = 18;
  const bottom = 32;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(...months.map((month) => Number(month.total) || 0), 1);
  const roundedMax = Math.ceil(maxValue / 100) * 100 || 100;
  const points = months.map((month, index) => ({
    x: left + (months.length === 1 ? plotWidth / 2 : (plotWidth * index) / (months.length - 1)),
    y: top + plotHeight - ((Number(month.total) || 0) / roundedMax) * plotHeight,
    month: String(month.month),
  }));

  const defs = createSvg("defs");
  const gradient = createSvg("linearGradient", { id: "revenue-gradient", x1: "0", x2: "0", y1: "0", y2: "1" });
  gradient.append(
    createSvg("stop", { offset: "0%", "stop-color": "#4c7fe7", "stop-opacity": ".2" }),
    createSvg("stop", { offset: "100%", "stop-color": "#4c7fe7", "stop-opacity": "0" }),
  );
  defs.append(gradient);
  chart.append(defs);

  for (let index = 0; index <= 3; index += 1) {
    const y = top + (plotHeight * index) / 3;
    const value = roundedMax * (1 - index / 3);
    chart.append(
      createSvg("line", { x1: left, y1: y, x2: width - right, y2: y, class: "chart-grid-line" }),
    );
    const label = createSvg("text", { x: left - 10, y: y + 3, class: "chart-axis-label", "text-anchor": "end" });
    label.textContent = formatINR(value);
    chart.append(label);
  }

  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = createSvg("polygon", {
    points: `${left},${top + plotHeight} ${pointString} ${width - right},${top + plotHeight}`,
    class: "chart-area",
  });
  chart.append(area, createSvg("polyline", { points: pointString, class: "chart-line" }));

  points.forEach((point, index) => {
    const pointCircle = createSvg("circle", { cx: point.x, cy: point.y, r: 4, class: "chart-point" });
    const tooltip = createSvg("title");
    tooltip.textContent = `${point.month}: ${formatINR(months[index].total)}`;
    pointCircle.append(tooltip);
    chart.append(pointCircle);
    const label = createSvg("text", { x: point.x, y: height - 7, class: "chart-month-label" });
    label.textContent = point.month;
    chart.append(label);
  });
})();
