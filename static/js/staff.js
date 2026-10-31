(() => {
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
  const left = 52;
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
    label.textContent = `$${Math.round(value)}`;
    chart.append(label);
  }

  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = createSvg("polygon", {
    points: `${left},${top + plotHeight} ${pointString} ${width - right},${top + plotHeight}`,
    class: "chart-area",
  });
  chart.append(area, createSvg("polyline", { points: pointString, class: "chart-line" }));

  points.forEach((point) => {
    chart.append(createSvg("circle", { cx: point.x, cy: point.y, r: 4, class: "chart-point" }));
    const label = createSvg("text", { x: point.x, y: height - 7, class: "chart-month-label" });
    label.textContent = point.month;
    chart.append(label);
  });
})();
