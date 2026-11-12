const DATASETS = {
  wavre: {
    url: "sales_history.csv",
    label: "Wavre",
    cardId: "overview-wavre",
    chartId: "wavre",
    capacityPerSession: 850,
    series: [
      { key: "billets_samedi", label: "Samedi", color: "#7358e8", eventDate: "2026-12-19" },
      { key: "billets_dimanche", label: "Dimanche", color: "#b7a9fa", eventDate: "2026-12-20" },
    ],
    totalKey: "total",
    deltaKey: "new_total",
  },
  lalouviere: {
    url: "sales_history_annie_LaLouviere.csv",
    label: "La Louvière",
    cardId: "overview-lalouviere",
    chartId: "lalouviere",
    capacityPerSession: 948,
    series: [
      { key: "participants_14h", label: "14 h", color: "#159b79", eventDate: "2027-03-21" },
      { key: "participants_18h30", label: "18 h 30", color: "#7ad4ba", eventDate: "2027-03-21" },
    ],
    totalKey: "total",
    deltaKey: "new_total",
  },
};

const numberFormat = new Intl.NumberFormat("fr-BE");
const averageFormat = new Intl.NumberFormat("fr-BE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateFormat = new Intl.DateTimeFormat("fr-BE", {
  day: "numeric",
  month: "short",
});
const fullDateFormat = new Intl.DateTimeFormat("fr-BE", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const rankingDateFormat = new Intl.DateTimeFormat("fr-BE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const eventDateFormat = new Intl.DateTimeFormat("fr-BE", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const weekdayNames = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) {
    throw new Error("Un champ CSV contient des guillemets non fermés.");
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("Le fichier ne contient encore aucun relevé.");
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) {
      throw new Error(`Ligne ${index + 2} : nombre de colonnes inattendu.`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateDifferenceInDays(start, end) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUtc - startUtc) / 86_400_000);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function numericValue(row, key) {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : null;
}

function readRows(rows, dataset) {
  const rowsByDate = new Map();
  rows.forEach((row) => {
    const date = parseDate(row.date);
    const total = numericValue(row, dataset.totalKey);
    const values = dataset.series.map((series) => numericValue(row, series.key));
    if (!date || total === null || values.some((value) => value === null)) return;
    rowsByDate.set(date.getTime(), { ...row, date, total, values });
  });
  const valid = [...rowsByDate.values()].sort((a, b) => a.date - b.date);

  if (!valid.length) {
    throw new Error("Aucun relevé valide n’a été trouvé.");
  }
  return valid;
}

function renderLastUpdated() {
  const updatedElement = document.getElementById("last-updated");
  if (!loadedDatasets.length) {
    updatedElement.textContent = "Dernière mise à jour indisponible";
    return;
  }

  const label = document.createElement("span");
  label.className = "last-updated-label";
  label.textContent = "Dernière mise à jour · Europe/Brussels";
  updatedElement.replaceChildren(label);

  loadedDatasets.forEach(({ dataset, rows }, index) => {
    const latest = rows[rows.length - 1];
    const formattedDate = [
      String(latest.date.getDate()).padStart(2, "0"),
      String(latest.date.getMonth() + 1).padStart(2, "0"),
      String(latest.date.getFullYear()).slice(-2),
    ].join("/");
    const item = document.createElement("span");
    item.className = "last-updated-item";
    item.append(
      document.createTextNode(
        `${index ? "· " : ""}${dataset.label} : ${formattedDate}`,
      ),
    );
    if (latest.heure) {
      item.append(document.createTextNode(" "));
      const time = document.createElement("span");
      time.className = "last-updated-time";
      time.textContent = latest.heure;
      item.append(time);
    }
    updatedElement.append(item);
  });
}

async function loadDataset(dataset) {
  const response = await fetch(dataset.url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Impossible de charger ${dataset.url} (HTTP ${response.status}).`);
  }
  return readRows(parseCsv(await response.text()), dataset);
}

function selectedRows(rows, period) {
  if (period === "all") return rows;
  const latest = rows[rows.length - 1].date;
  if (period === "yesterday") {
    const yesterday = addDays(latest, -1);
    return rows.filter((row) => row.date.getTime() === yesterday.getTime());
  }
  const start = new Date(latest);
  start.setDate(start.getDate() - Number(period) + 1);
  return rows.filter((row) => row.date >= start);
}

function periodChange(rows, visible, dataset, period) {
  if (!visible.length) return null;
  if (period === "all") {
    return visible[visible.length - 1].total - visible[0].total;
  }

  const firstVisible = visible[0];
  const previous = [...rows].reverse().find((row) => row.date < firstVisible.date);
  if (previous) return visible[visible.length - 1].total - previous.total;
  return numericValue(visible[visible.length - 1], dataset.deltaKey) ?? 0;
}

function updateCard(dataset, rows, visible, period) {
  const card = document.getElementById(dataset.cardId);
  const latest = rows[rows.length - 1];
  const change = periodChange(rows, visible, dataset, period);
  const periodLabel = period === "all"
    ? "depuis le début"
    : period === "yesterday"
      ? "hier"
      : `sur ${period} jours`;

  card.querySelector('[data-field="total"]').textContent = numberFormat.format(latest.total);
  card.querySelector('[data-field="first"]').textContent = numberFormat.format(latest.values[0]);
  card.querySelector('[data-field="second"]').textContent = numberFormat.format(latest.values[1]);
  card.querySelector('[data-field="updated"]').textContent = latest.heure
    ? `${dateFormat.format(latest.date)} · ${latest.heure}`
    : dateFormat.format(latest.date);

  const badge = card.querySelector('[data-field="change"]');
  if (change === null) {
    badge.textContent = "Pas de relevé hier";
  } else {
    badge.textContent = `${change > 0 ? "+" : ""}${numberFormat.format(change)} ${periodLabel}`;
  }
  badge.classList.toggle("is-negative", change !== null && change < 0);
  badge.classList.toggle("is-neutral", change === null || change === 0);

  if (dataset.capacityPerSession) {
    dataset.series.forEach((series, index) => {
      const sold = Math.max(0, latest.values[index]);
      const capacity = dataset.capacityPerSession;
      const occupied = Math.min(sold, capacity);
      const remaining = Math.max(0, capacity - sold);
      const percentage = (sold / capacity) * 100;
      const capacityBar = card.querySelector(`[data-field="capacity-bar-${index}"]`);

      card.querySelector(`[data-field="capacity-percent-${index}"]`).textContent =
        `${new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 1 }).format(percentage)} %`;
      card.querySelector(`[data-field="capacity-caption-${index}"]`).textContent =
        `${numberFormat.format(remaining)} places disponibles sur ${numberFormat.format(capacity)}`;
      capacityBar.setAttribute("aria-valuenow", String(occupied));
      capacityBar.setAttribute("aria-valuetext", `${series.label} : ${numberFormat.format(sold)} billets vendus sur ${numberFormat.format(capacity)}`);
      capacityBar.firstElementChild.style.width = `${Math.min(percentage, 100)}%`;
    });
  }
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function renderChart(dataset, rows, visible) {
  const container = document.querySelector(`[data-chart="${dataset.chartId}"]`);
  container.replaceChildren();

  if (!visible.length) {
    const message = document.createElement("p");
    message.className = "chart-message";
    message.textContent = "Aucun relevé enregistré hier.";
    container.append(message);
    const footnote = document.querySelector(`[data-footnote="${dataset.chartId}"]`);
    footnote.textContent = "";
    return;
  }

  const width = Math.max(container.clientWidth, 300);
  const height = 220;
  const margin = { top: 16, right: 12, bottom: 30, left: 39 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = visible.flatMap((row) => row.values);
  const maxValue = Math.max(...values, 1);
  const step = Math.max(1, Math.ceil(maxValue / 4 / 10) * 10);
  const axisMax = Math.ceil(maxValue / step) * step || 1;
  const x = (index) => margin.left + (visible.length === 1
    ? plotWidth / 2
    : (index / (visible.length - 1)) * plotWidth);
  const y = (value) => margin.top + plotHeight - (value / axisMax) * plotHeight;
  const svg = svgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `Évolution des ventes du ${fullDateFormat.format(visible[0].date)} au ${fullDateFormat.format(visible[visible.length - 1].date)}`,
  });

  for (let tick = 0; tick <= axisMax; tick += step) {
    const tickY = y(tick);
    svg.append(svgElement("line", {
      x1: margin.left,
      x2: width - margin.right,
      y1: tickY,
      y2: tickY,
      class: "chart-grid",
    }));
    const label = svgElement("text", {
      x: margin.left - 9,
      y: tickY + 3,
      "text-anchor": "end",
      class: "chart-axis-label",
    });
    label.textContent = numberFormat.format(tick);
    svg.append(label);
  }

  const labelIndexes = new Set([0, Math.floor((visible.length - 1) / 2), visible.length - 1]);
  for (const index of labelIndexes) {
    const label = svgElement("text", {
      x: x(index),
      y: height - 7,
      "text-anchor": index === 0 ? "start" : index === visible.length - 1 ? "end" : "middle",
      class: "chart-date-label",
    });
    label.textContent = dateFormat.format(visible[index].date);
    svg.append(label);
  }

  dataset.series.forEach((series, seriesIndex) => {
    const points = visible.map((row, index) => `${x(index)},${y(row.values[seriesIndex])}`);
    svg.append(svgElement("polyline", {
      points: points.join(" "),
      class: "chart-line",
      stroke: series.color,
    }));

    visible.forEach((row, index) => {
      const point = svgElement("circle", {
        cx: x(index),
        cy: y(row.values[seriesIndex]),
        r: visible.length > 35 ? 2 : 3.5,
        fill: series.color,
        class: "chart-point",
      });
      const title = svgElement("title");
      title.textContent = `${fullDateFormat.format(row.date)} · ${series.label} : ${numberFormat.format(row.values[seriesIndex])}`;
      point.append(title);
      svg.append(point);
    });
  });

  container.append(svg);
  const footnote = document.querySelector(`[data-footnote="${dataset.chartId}"]`);
  footnote.textContent = visible.length === 1
    ? `Premier relevé disponible · ${fullDateFormat.format(visible[0].date)}. La courbe se dessinera au fil des prochains relevés.`
    : `${visible.length} relevés affichés · ${fullDateFormat.format(visible[0].date)} – ${fullDateFormat.format(visible[visible.length - 1].date)}.`;
}

function renderRankings(dataset, rows) {
  const list = document.querySelector(`[data-ranking="${dataset.chartId}"]`);
  const topFive = rows.slice(1).map((row, index) => {
    const previous = rows[index];
    return {
      row,
      previous,
      change: row.total - previous.total,
    };
  }).filter((entry) => entry.change > 0)
    .sort((a, b) => b.change - a.change || b.row.date - a.row.date)
    .slice(0, 5);

  list.replaceChildren();
  if (!topFive.length) {
    const empty = document.createElement("li");
    empty.className = "ranking-empty";
    empty.textContent = rows.length < 2
      ? "En attente d’un deuxième relevé pour établir le classement."
      : "Aucune hausse de ventes enregistrée.";
    list.append(empty);
    return;
  }

  topFive.forEach(({ row, previous, change }, index) => {
    const item = document.createElement("li");
    const rank = document.createElement("span");
    rank.className = "ranking-number";
    rank.textContent = String(index + 1).padStart(2, "0");

    const dates = document.createElement("span");
    dates.className = "ranking-dates";
    dates.textContent = previous.date.getTime() === row.date.getTime()
      ? rankingDateFormat.format(row.date)
      : `${rankingDateFormat.format(previous.date)} – ${rankingDateFormat.format(row.date)}`;

    const amount = document.createElement("strong");
    amount.className = "ranking-change";
    amount.textContent = `+${numberFormat.format(change)}`;
    item.append(rank, dates, amount);
    list.append(item);
  });
}

function renderWeekdayStats(dataset, rows) {
  const card = document.querySelector(`[data-weekday-stats="${dataset.chartId}"]`);
  const stats = weekdayNames.map((day) => ({ day, sum: 0, count: 0 }));

  rows.slice(1).forEach((row, index) => {
    const previous = rows[index];
    const stat = stats[row.date.getDay()];
    stat.sum += row.total - previous.total;
    stat.count += 1;
  });

  const observed = stats.filter((stat) => stat.count > 0)
    .map((stat) => ({ ...stat, average: stat.sum / stat.count }))
    .sort((a, b) => b.average - a.average);
  const best = observed[0];
  const summary = card.querySelector("[data-best-day]");
  const list = card.querySelector("[data-weekday-list]");
  list.replaceChildren();

  if (!best) {
    summary.textContent = "En attente de plusieurs relevés";
    const empty = document.createElement("li");
    empty.className = "weekday-empty";
    empty.textContent = "Les tendances par jour apparaîtront après les prochains relevés.";
    list.append(empty);
    return;
  }

  if (best.count >= 3) {
    summary.textContent = `Meilleur jour observé : ${best.day} · ${best.average > 0 ? "+" : ""}${averageFormat.format(best.average)} billets/relevé en moyenne`;
  } else {
    summary.textContent = `À confirmer : ${best.day} est en tête, mais le nombre de relevés reste limité.`;
  }

  const maxMagnitude = Math.max(...observed.map((stat) => Math.abs(stat.average)), 1);
  const orderedWeekdays = [...observed].sort((a, b) => b.average - a.average);
  orderedWeekdays.forEach((stat) => {
    const item = document.createElement("li");
    item.className = "weekday-row";
    const label = document.createElement("span");
    label.className = "weekday-name";
    label.textContent = stat.day;

    const track = document.createElement("span");
    track.className = "weekday-track";
    const bar = document.createElement("span");
    bar.className = `weekday-bar${stat.average < 0 ? " is-negative" : ""}`;
    bar.style.width = `${Math.max(3, (Math.abs(stat.average) / maxMagnitude) * 100)}%`;
    track.append(bar);

    const average = document.createElement("strong");
    average.className = "weekday-average";
    average.textContent = `${stat.average > 0 ? "+" : ""}${averageFormat.format(stat.average)}`;
    const samples = document.createElement("small");
    samples.className = "weekday-samples";
    samples.textContent = `${stat.count} relevé${stat.count > 1 ? "s" : ""}`;
    item.append(label, track, average, samples);
    list.append(item);
  });
}

function renderMonthWeekStats(dataset, rows) {
  const card = document.querySelector(`[data-month-week-stats="${dataset.chartId}"]`);
  const periods = new Map();

  rows.slice(1).forEach((row, index) => {
    const previous = rows[index];
    const monthWeek = Math.ceil(row.date.getDate() / 7);
    const monthKey = `${row.date.getFullYear()}-${row.date.getMonth()}-${monthWeek}`;
    const period = periods.get(monthKey) ?? { monthWeek, total: 0 };
    period.total += row.total - previous.total;
    periods.set(monthKey, period);
  });

  const grouped = Array.from(periods.values()).reduce((stats, period) => {
    const stat = stats[period.monthWeek - 1];
    stat.sum += period.total;
    stat.count += 1;
    return stats;
  }, Array.from({ length: 5 }, (_, index) => ({
    week: index + 1,
    sum: 0,
    count: 0,
  })));

  const observed = grouped.filter((stat) => stat.count > 0)
    .map((stat) => ({ ...stat, average: stat.sum / stat.count }))
    .sort((a, b) => b.average - a.average);
  const best = observed[0];
  const summary = card.querySelector("[data-best-month-week]");
  const list = card.querySelector("[data-month-week-list]");
  list.replaceChildren();

  if (!best) {
    summary.textContent = "En attente de plusieurs relevés";
    const empty = document.createElement("li");
    empty.className = "weekday-empty";
    empty.textContent = "Les tendances par semaine du mois apparaîtront après les prochains relevés.";
    list.append(empty);
    return;
  }

  if (best.count >= 2) {
    summary.textContent = `Période la plus vendeuse : semaine ${best.week} · ${best.average > 0 ? "+" : ""}${averageFormat.format(best.average)} billets par semaine en moyenne`;
  } else {
    summary.textContent = `À confirmer : la semaine ${best.week} est en tête, mais elle n’apparaît que dans ${best.count} mois.`;
  }

  const maxMagnitude = Math.max(...observed.map((stat) => Math.abs(stat.average)), 1);
  observed.forEach((stat) => {
    const item = document.createElement("li");
    item.className = "weekday-row";
    const label = document.createElement("span");
    label.className = "weekday-name";
    label.textContent = `Semaine ${stat.week}`;

    const track = document.createElement("span");
    track.className = "weekday-track";
    const bar = document.createElement("span");
    bar.className = `weekday-bar${stat.average < 0 ? " is-negative" : ""}`;
    bar.style.width = `${Math.max(3, (Math.abs(stat.average) / maxMagnitude) * 100)}%`;
    track.append(bar);

    const average = document.createElement("strong");
    average.className = "weekday-average";
    average.textContent = `${stat.average > 0 ? "+" : ""}${averageFormat.format(stat.average)}`;
    const samples = document.createElement("small");
    samples.className = "weekday-samples";
    samples.textContent = `${stat.count} mois`;
    item.append(label, track, average, samples);
    list.append(item);
  });
}

function getRecentDailyRate(rows, seriesIndex) {
  const latest = rows[rows.length - 1];
  const cutoff = addDays(latest.date, -30);
  const baseline = [...rows].reverse().find((row) => row.date <= cutoff);
  if (!baseline) return null;

  const elapsedDays = dateDifferenceInDays(baseline.date, latest.date);
  if (elapsedDays < 7 || elapsedDays > 45) return null;

  return {
    dailyRate: (latest.values[seriesIndex] - baseline.values[seriesIndex]) / elapsedDays,
    elapsedDays,
  };
}

function renderForecast(dataset, rows) {
  const card = document.querySelector(`[data-forecast-city="${dataset.chartId}"]`);
  const list = card.querySelector("[data-projection-list]");
  const latest = rows[rows.length - 1];
  list.replaceChildren();

  dataset.series.forEach((series, index) => {
    const capacity = dataset.capacityPerSession;
    const sold = Math.max(0, latest.values[index]);
    const remaining = Math.max(0, capacity - sold);
    const eventDate = parseDate(series.eventDate);
    const daysUntilEvent = dateDifferenceInDays(latest.date, eventDate);
    const requiredDailyRate = daysUntilEvent > 0 ? remaining / daysUntilEvent : null;
    const recent = getRecentDailyRate(rows, index);
    const item = document.createElement("li");
    item.className = "projection-session";

    const heading = document.createElement("div");
    heading.className = "projection-heading";
    const label = document.createElement("strong");
    label.textContent = series.label;
    const eventDateLabel = document.createElement("span");
    eventDateLabel.textContent = eventDateFormat.format(eventDate);
    heading.append(label, eventDateLabel);

    const sales = document.createElement("p");
    sales.className = "projection-sales";
    sales.textContent = `${numberFormat.format(sold)} / ${numberFormat.format(capacity)} vendus · ${numberFormat.format(remaining)} restants`;

    const status = document.createElement("p");
    status.className = "projection-status";
    const pace = document.createElement("p");
    pace.className = "projection-pace";

    if (remaining === 0) {
      status.textContent = "Séance complète";
      pace.textContent = "La capacité est atteinte.";
    } else if (daysUntilEvent <= 0) {
      status.textContent = "Date de l’événement passée";
      pace.textContent = `Dernier relevé : ${eventDateFormat.format(latest.date)}.`;
    } else {
      pace.textContent = `Pour afficher complet le jour J : ${averageFormat.format(requiredDailyRate)} billets nets par jour.`;
      if (!recent) {
        status.textContent = "Historique insuffisant pour estimer une date de complet.";
        pace.textContent += " Un rythme fiable sera calculé après plusieurs relevés espacés.";
      } else if (recent.dailyRate <= 0) {
        status.textContent = "Pas de projection de complet au rythme récent.";
        pace.textContent += ` Rythme récent : ${averageFormat.format(recent.dailyRate)} billet net par jour.`;
        const projectedSold = Math.min(
          capacity,
          Math.max(0, Math.round(sold + recent.dailyRate * daysUntilEvent)),
        );
        const projection = document.createElement("p");
        projection.className = "projection-day-estimate";
        projection.textContent = `Projection au jour J : environ ${numberFormat.format(projectedSold)} vendues · ${numberFormat.format(capacity - projectedSold)} restantes.`;
        item.append(heading, sales, status, pace, projection);
        list.append(item);
        return;
      } else {
        const estimatedDays = Math.ceil(remaining / recent.dailyRate);
        const estimatedDate = addDays(latest.date, estimatedDays);
        const pacePercentage = (recent.dailyRate / requiredDailyRate) * 100;
        const projectedSold = Math.min(
          capacity,
          Math.max(0, Math.round(sold + recent.dailyRate * daysUntilEvent)),
        );
        const forecastBeforeEvent = estimatedDays <= daysUntilEvent;
        status.textContent = forecastBeforeEvent
          ? `Projection au rythme actuel : complet vers le ${eventDateFormat.format(estimatedDate)}.`
          : `Au rythme actuel, pas complet avant le jour J (projection : ${eventDateFormat.format(estimatedDate)}).`;
        pace.textContent = `Rythme récent : ${averageFormat.format(recent.dailyRate)} billets nets/jour · ${averageFormat.format(pacePercentage)} % du rythme nécessaire.`;
        const projection = document.createElement("p");
        projection.className = "projection-day-estimate";
        projection.textContent = `Projection au jour J : environ ${numberFormat.format(projectedSold)} vendues · ${numberFormat.format(capacity - projectedSold)} restantes.`;

        const track = document.createElement("span");
        track.className = "projection-track";
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-label", `Rythme récent par rapport au rythme nécessaire pour ${series.label}`);
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");
        track.setAttribute("aria-valuenow", String(Math.min(100, Math.max(0, pacePercentage))));
        const bar = document.createElement("span");
        bar.style.width = `${Math.min(100, Math.max(0, pacePercentage))}%`;
        track.append(bar);
        item.append(heading, sales, status, pace, projection, track);
        list.append(item);
        return;
      }
    }

    item.append(heading, sales, status, pace);
    list.append(item);
  });
}

let loadedDatasets = [];

function renderDashboard() {
  const period = document.getElementById("period-filter").value;
  for (const { dataset, rows } of loadedDatasets) {
    const visible = selectedRows(rows, period);
    updateCard(dataset, rows, visible, period);
    renderChart(dataset, rows, visible);
  }
}

async function startDashboard() {
  const results = await Promise.allSettled(
    Object.values(DATASETS).map(async (dataset) => ({
      dataset,
      rows: await loadDataset(dataset),
    })),
  );
  const errors = [];
  loadedDatasets = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      loadedDatasets.push(result.value);
      renderRankings(result.value.dataset, result.value.rows);
      renderWeekdayStats(result.value.dataset, result.value.rows);
      renderMonthWeekStats(result.value.dataset, result.value.rows);
      renderForecast(result.value.dataset, result.value.rows);
    } else {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  if (errors.length) {
    const errorBanner = document.getElementById("page-error");
    errorBanner.textContent = `Certaines données n’ont pas pu être affichées : ${errors.join(" ")}`;
    errorBanner.hidden = false;
  }

  if (loadedDatasets.length) renderDashboard();
  renderLastUpdated();
  if (!loadedDatasets.length && !errors.length) {
    throw new Error("Aucun fichier de données n’a pu être chargé.");
  }
}

document.getElementById("period-filter").addEventListener("change", renderDashboard);
window.addEventListener("resize", renderDashboard);

const cityTabs = [...document.querySelectorAll(".city-tab")];
cityTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectCityTab(tab));
  tab.addEventListener("keydown", (event) => {
    let nextIndex;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % cityTabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + cityTabs.length) % cityTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = cityTabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectCityTab(cityTabs[nextIndex]);
    cityTabs[nextIndex].focus();
  });
});

function selectCityTab(selectedTab) {
  for (const tab of cityTabs) {
    const active = tab === selectedTab;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !active;
  }
  renderDashboard();
}

startDashboard().catch((error) => {
  const errorBanner = document.getElementById("page-error");
  errorBanner.textContent = `Le tableau de bord n’a pas pu être chargé : ${error.message}`;
  errorBanner.hidden = false;
});
