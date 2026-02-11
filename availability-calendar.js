/* availability-calendar.js */
(function (root, factory) {
    if (typeof define === "function" && define.amd) define([], factory);
    else if (typeof module === "object" && module.exports) module.exports = factory();
    else root.AvailabilityCalendar = factory();
  })(typeof self !== "undefined" ? self : this, function () {
    "use strict";
  
    const pad2 = (n) => String(n).padStart(2, "0");
    const toISODateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  
    // API devuelve "YYYY-MM-DD HH:MM:SS" -> lo tratamos como local
    const parseLocalDateTime = (s) => new Date(s.replace(" ", "T"));
  
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const addDays = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const formatMonthTitle = (date, locale) => date.toLocaleDateString(locale, { month: "long", year: "numeric" });
    const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  
    function formatTimeRange(slot, locale) {
      const s = parseLocalDateTime(slot.start);
      const e = parseLocalDateTime(slot.stop);
      const opts = { hour: "2-digit", minute: "2-digit" };
      return `${s.toLocaleTimeString(locale, opts)} – ${e.toLocaleTimeString(locale, opts)}`;
    }
  
    class AvailabilityCalendar {
      /**
       * @param {HTMLElement|string} container
       * @param {Object} options
       * options.data: respuesta API availability {days:[{date, slots:[{start,stop,...}]}]}
       * options.maxDays: 30
       * options.locale: 'es-ES'
       * options.weekStartsOn: 1 (lunes)
       * options.hideMonthNav: false
       * options.onSlotSelect: ({date, slot}) => {}
       */
      constructor(container, options = {}) {
        this.el = typeof container === "string" ? document.querySelector(container) : container;
        if (!this.el) throw new Error("AvailabilityCalendar: container not found");
  
        this.opts = {
          data: options.data || null,
          maxDays: Number.isFinite(options.maxDays) ? options.maxDays : 30,
          locale: options.locale || "es-ES",
          weekStartsOn: Number.isFinite(options.weekStartsOn) ? options.weekStartsOn : 1,
          hideMonthNav: !!options.hideMonthNav,
          onSlotSelect: typeof options.onSlotSelect === "function" ? options.onSlotSelect : null,
        };
  
        this._today = startOfDay(new Date());
        this._rangeStart = this._today;
        this._rangeEnd = startOfDay(addDays(this._today, this.opts.maxDays)); // hasta hoy + maxDays
  
        this._currentMonth = new Date(this._today.getFullYear(), this._today.getMonth(), 1);
        this._selectedDateKey = null;
        this._selectedSlotStart = null; // string "YYYY-MM-DD HH:MM:SS"
        this._dataMap = new Map(); // dateKey -> slots[]
  
        this._boundPrev = () => this.prevMonth();
        this._boundNext = () => this.nextMonth();
  
        this._build();
        this.setData(this.opts.data);
        this.render();
      }
  
      destroy() {
        this._root?.querySelector(".ac__prev")?.removeEventListener("click", this._boundPrev);
        this._root?.querySelector(".ac__next")?.removeEventListener("click", this._boundNext);
        this.el.innerHTML = "";
        this._dataMap.clear();
      }
  
      setData(apiData) {
        this._dataMap.clear();
        this.opts.data = apiData || null;
  
        const days = apiData?.days || [];
        for (const d of days) {
          if (d?.date) this._dataMap.set(d.date, Array.isArray(d.slots) ? d.slots : []);
        }
  
        // auto-selección: primer día con slots dentro del rango
        if (!this._selectedDateKey) {
          const first = days.find(x => x?.date && (x?.slots?.length || 0) > 0);
          if (first?.date) this._selectedDateKey = first.date;
        }
  
        // si el selected slot ya no existe, se limpia
        if (this._selectedSlotStart) {
          const slots = this._dataMap.get(this._selectedDateKey) || [];
          if (!slots.some(s => s.start === this._selectedSlotStart)) this._selectedSlotStart = null;
        }
      }
  
      render() {
        this._renderHeader();
        this._renderGrid();
        this._renderSlotsPanel();
        this._updateNavButtons();
      }
  
      prevMonth() {
        const prev = new Date(this._currentMonth);
        prev.setMonth(prev.getMonth() - 1);
        if (this._monthEnd(prev) < this._rangeStart) return;
        this._currentMonth = prev;
        this.render();
      }
  
      nextMonth() {
        const next = new Date(this._currentMonth);
        next.setMonth(next.getMonth() + 1);
        if (this._monthStart(next) > this._rangeEnd) return;
        this._currentMonth = next;
        this.render();
      }
  
      // --- private ---
      _build() {
        this.el.innerHTML = "";
        this._root = document.createElement("div");
        this._root.className = "ac";
        this._root.innerHTML = `
          <div class="ac__header">
            <div class="ac__title"></div>
            <div class="ac__nav" ${this.opts.hideMonthNav ? 'style="display:none"' : ""}>
              <button type="button" class="ac__btn ac__prev" aria-label="Mes anterior">‹</button>
              <button type="button" class="ac__btn ac__next" aria-label="Mes siguiente">›</button>
            </div>
          </div>
  
          <div class="ac__grid">
            <div class="ac__weekdays"></div>
            <div class="ac__days"></div>
          </div>
  
          <div class="ac__slots">
            <div class="ac__slotsTitle">
              <span class="ac__slotsLabel">Horarios</span>
              <span class="ac__slotsDate"></span>
            </div>
            <div class="ac__slotsList"></div>
            <div class="ac__empty" style="display:none;"></div>
          </div>
        `;
        this.el.appendChild(this._root);
  
        this._root.querySelector(".ac__prev").addEventListener("click", this._boundPrev);
        this._root.querySelector(".ac__next").addEventListener("click", this._boundNext);
  
        const weekdaysEl = this._root.querySelector(".ac__weekdays");
        const names = this._weekdayNames(this.opts.locale, this.opts.weekStartsOn);
        weekdaysEl.innerHTML = names.map(n => `<div>${n}</div>`).join("");
      }
  
      _renderHeader() {
        this._root.querySelector(".ac__title").textContent = cap(formatMonthTitle(this._currentMonth, this.opts.locale));
      }
  
      _renderGrid() {
        const daysEl = this._root.querySelector(".ac__days");
        daysEl.innerHTML = "";
      
        const monthStart = this._monthStart(this._currentMonth);
        const monthEnd = this._monthEnd(this._currentMonth);
      
        const gridStart = this._startOfWeek(monthStart, this.opts.weekStartsOn);
        const gridEnd = this._endOfWeek(monthEnd, this.opts.weekStartsOn);
      
        let cursor = new Date(gridStart);
      
        while (cursor <= gridEnd) {
          // ✅ CLAVE: congelar la fecha de esta celda (NO usar cursor directo en handlers)
          const cellDate = new Date(cursor);
          const dayKey = toISODateKey(cellDate);
      
          const inMonth = cellDate.getMonth() === this._currentMonth.getMonth();
          const disabled = cellDate < this._rangeStart || cellDate > this._rangeEnd;
      
          const slots = this._dataMap.get(dayKey) || [];
          const hasSlots = slots.length > 0;
      
          const cell = document.createElement("div");
          cell.className = "ac__day";
      
          if (!inMonth) cell.classList.add("ac__day--muted");
          if (disabled) cell.classList.add("ac__day--disabled");
          if (sameDay(cellDate, this._today)) cell.classList.add("ac__day--today");
          if (hasSlots && !disabled) cell.classList.add("ac__day--available");
          if (this._selectedDateKey === dayKey) cell.classList.add("ac__day--selected");
      
          cell.innerHTML = `
            <div class="ac__dayNum">${cellDate.getDate()}</div>
            ${hasSlots && !disabled ? `<div class="ac__badge">${slots.length}</div>` : `<div></div>`}
          `;
      
          if (!disabled) {
            cell.addEventListener("click", () => {
              this._selectedDateKey = dayKey;
              this._selectedSlotStart = null;
      
              // ✅ IMPORTANTE: NO cambiar de mes al hacer click
              this.render();
            });
          }
      
          daysEl.appendChild(cell);
      
          // avanzar cursor
          cursor.setDate(cursor.getDate() + 1);
        }
      }      
  
      _renderSlotsPanel() {
        const dateEl = this._root.querySelector(".ac__slotsDate");
        const list = this._root.querySelector(".ac__slotsList");
        const empty = this._root.querySelector(".ac__empty");
  
        list.innerHTML = "";
        empty.style.display = "none";
  
        const selectedKey = this._selectedDateKey || toISODateKey(this._today);
        const slots = this._dataMap.get(selectedKey) || [];
        dateEl.textContent = selectedKey;
  
        if (!slots.length) {
          empty.textContent = "No hay horarios disponibles para este día.";
          empty.style.display = "block";
          return;
        }
  
        for (const slot of slots) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "ac__slotBtn";
          btn.textContent = formatTimeRange(slot, this.opts.locale);
  
          if (slot.start === this._selectedSlotStart) btn.classList.add("ac__slotBtn--selected");
  
          btn.addEventListener("click", () => {
            this._selectedSlotStart = slot.start;
            this._renderSlotsPanel(); // re-render solo panel para marcar seleccionado
            if (this.opts.onSlotSelect) this.opts.onSlotSelect({ date: selectedKey, slot });
          });
  
          list.appendChild(btn);
        }
      }
  
      _updateNavButtons() {
        if (this.opts.hideMonthNav) return;
        const prevBtn = this._root.querySelector(".ac__prev");
        const nextBtn = this._root.querySelector(".ac__next");
  
        const prevMonth = new Date(this._currentMonth); prevMonth.setMonth(prevMonth.getMonth() - 1);
        const nextMonth = new Date(this._currentMonth); nextMonth.setMonth(nextMonth.getMonth() + 1);
  
        prevBtn.disabled = this._monthEnd(prevMonth) < this._rangeStart;
        nextBtn.disabled = this._monthStart(nextMonth) > this._rangeEnd;
      }
  
      _weekdayNames(locale, weekStartsOn) {
        const base = new Date(2023, 0, 1); // domingo
        const names = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(base);
          d.setDate(base.getDate() + ((weekStartsOn + i) % 7));
          names.push(d.toLocaleDateString(locale, { weekday: "short" }).replace(".", ""));
        }
        return names;
      }
  
      _startOfWeek(date, weekStartsOn) {
        const d = startOfDay(date);
        const day = d.getDay();
        const diff = (day - weekStartsOn + 7) % 7;
        d.setDate(d.getDate() - diff);
        return d;
      }
  
      _endOfWeek(date, weekStartsOn) {
        const d = startOfDay(date);
        const day = d.getDay();
        const shift = (weekStartsOn - day - 1 + 7) % 7;
        d.setDate(d.getDate() + (6 - ((day - weekStartsOn + 7) % 7)));
        return d;
      }
  
      _monthStart(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
      }
  
      _monthEnd(date) {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
      }
    }
  
    return AvailabilityCalendar;
  });
  