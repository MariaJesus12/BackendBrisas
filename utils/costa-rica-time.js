const COSTA_RICA_TIME_ZONE = "America/Costa_Rica";
const COSTA_RICA_UTC_OFFSET_HOURS = 6;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: COSTA_RICA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // h23 garantiza 00:00 para medianoche; algunos runtimes formatean con h24.
  hourCycle: "h23",
});

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildMySqlDateTime(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

function getCostaRicaDateTimeParts(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formattedParts = dateTimeFormatter.formatToParts(date);
  const lookup = Object.fromEntries(formattedParts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function toCostaRicaMySqlDateTime(value) {
  const parts = getCostaRicaDateTimeParts(value);
  return parts ? buildMySqlDateTime(parts) : null;
}

function parseDateTimeInCostaRica(value) {
  if (value == null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const raw = String(value).trim();
  const localMatch = raw.match(LOCAL_DATE_TIME_PATTERN);

  if (localMatch) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const hour = Number(localMatch[4] || 0);
    const minute = Number(localMatch[5] || 0);
    const second = Number(localMatch[6] || 0);

    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const isValidLocalDateTime =
      Number.isInteger(year) &&
      year >= 1000 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= maxDay &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59 &&
      second >= 0 &&
      second <= 59;

    if (!isValidLocalDateTime) {
      return null;
    }

    const utcDate = new Date(Date.UTC(year, month - 1, day, hour + COSTA_RICA_UTC_OFFSET_HOURS, minute, second));
    return Number.isNaN(utcDate.getTime()) ? null : utcDate;
  }

  const direct = new Date(raw);
  return Number.isNaN(direct.getTime()) ? null : direct;
}

function buildCostaRicaDateRangeFromDay(rawDate) {
  const trimmed = String(rawDate || "").trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const start = parseDateTimeInCostaRica(`${trimmed} 00:00:00`);
  const end = parseDateTimeInCostaRica(`${trimmed} 23:59:59`);

  if (!start || !end) {
    return null;
  }

  return {
    from: toCostaRicaMySqlDateTime(start),
    to: toCostaRicaMySqlDateTime(end),
  };
}

function getCurrentCostaRicaDateTimeString() {
  return toCostaRicaMySqlDateTime(new Date());
}

module.exports = {
  buildCostaRicaDateRangeFromDay,
  getCurrentCostaRicaDateTimeString,
  parseDateTimeInCostaRica,
  toCostaRicaMySqlDateTime,
};
