import { basePhases, defaultBudget } from './data.js';
import { stateDocRef, setDoc, onSnapshot } from './firebase.js';

const CHECK_SVG =
  '<svg viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4 8-9" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let phases = [];
      let state = {};
      let firestoreReady = false;

      function syncPhasesFromState() {
        const extraTasks = state.__customTasks || {};
        const extraPhases = state.__customPhases || [];
        const phaseEdits = state.__phaseEdits || {};
        const taskEdits = state.__taskEdits || {};
        const deletedTasks = new Set(state.__deletedTasks || []);
        const deletedPhases = new Set(state.__deletedPhases || []);
        phases = [...basePhases, ...extraPhases]
          .filter((phase) => !deletedPhases.has(phase.id))
          .map((phase) => ({
            ...phase,
            ...(phaseEdits[phase.id] || {}),
            tasks: [...phase.tasks, ...(extraTasks[phase.id] || [])]
              .filter((task) => !deletedTasks.has(task.id))
              .map((task) => ({ ...task, ...(taskEdits[task.id] || {}) })),
          }));
      }

      function makeId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }

      function saveCustomData(key, value) {
        state[key] = value;
        if (firestoreReady) {
          setDoc(stateDocRef, { [key]: value }, { merge: true }).catch((e) => console.error('firestore write error', e));
        } else {
          try { localStorage.setItem('kz-roadmap-state-v1', JSON.stringify(state)); }
          catch (e) { console.error('storage write error', e); }
        }
      }

      function fmt(n) {
        return n.toLocaleString('ru-RU') + ' ₽';
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;');
      }

      function getBudget() {
        return state.__budget || defaultBudget.map(([name, amount], index) => ({ id: `budget_${index + 1}`, name, amount }));
      }

      function saveBudget(entries) {
        saveCustomData('__budget', entries);
      }

      function getIncome() {
        return state.__income || [];
      }

      function saveIncome(entries) {
        saveCustomData('__income', entries);
      }

      function getCustomIncomeTables() {
        return state.__incomeTables || [];
      }

      function saveCustomIncomeTables(tables) {
        saveCustomData('__incomeTables', tables);
      }

      function renderDefaultTableVisibility() {
        const hiddenTables = state.__hiddenDefaultTables || [];
        document.getElementById('budgetCard').hidden = hiddenTables.includes('budget');
        document.getElementById('incomeCard').hidden = hiddenTables.includes('income');
      }

      function loadLocalState() {
        try {
          const raw = localStorage.getItem('kz-roadmap-state-v1');
          state = raw ? JSON.parse(raw) : {};
        } catch (e) {
          state = {};
        }
      }

      function initFirestore() {
        try {
          // слушаем изменения в реальном времени — от себя и от других людей
          onSnapshot(
            stateDocRef,
            (snap) => {
              firestoreReady = true;
              state = snap.exists() ? snap.data() : {};
              render();
              renderBudget();
              renderIncome();
              renderCustomIncomeTables();
              renderDefaultTableVisibility();
            },
            (err) => {
              console.error('Firestore listen failed, falling back to localStorage', err);
              firestoreReady = false;
              loadLocalState();
              render();
              renderBudget();
              renderIncome();
              renderCustomIncomeTables();
              renderDefaultTableVisibility();
            },
          );
        } catch (e) {
          console.error('Firestore init failed, falling back to localStorage', e);
          firestoreReady = false;
          loadLocalState();
          renderBudget();
          renderIncome();
          renderCustomIncomeTables();
          renderDefaultTableVisibility();
        }
      }

      function setTaskState(id, val) {
        state[id] = val;
        const completedAtKey = id + '__completedAt';
        state[completedAtKey] = val ? new Date().toISOString().slice(0, 10) : '';
        if (firestoreReady) {
          setDoc(stateDocRef, { [id]: val, [completedAtKey]: state[completedAtKey] }, { merge: true }).catch((e) =>
            console.error('firestore write error', e),
          );
          // render() придёт через onSnapshot выше
        } else {
          try {
            localStorage.setItem('kz-roadmap-state-v1', JSON.stringify(state));
          } catch (e) {
            console.error('storage write error', e);
          }
        }
      }

      function setDue(id, dateStr) {
        const key = id + '__due';
        state[key] = dateStr;
        if (firestoreReady) {
          setDoc(stateDocRef, { [key]: dateStr }, { merge: true }).catch((e) =>
            console.error('firestore write error', e),
          );
        } else {
          try {
            localStorage.setItem('kz-roadmap-state-v1', JSON.stringify(state));
          } catch (e) {
            console.error('storage write error', e);
          }
        }
      }

      function dueStatus(dateStr, done) {
        if (!dateStr) return 'none';
        if (done) return 'done-neutral';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dateStr + 'T00:00:00');
        const diffDays = Math.round((due - today) / 86400000);
        if (diffDays < 0) return 'overdue';
        if (diffDays <= 5) return 'soon';
        return 'ok';
      }

      function formatDue(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
      }

      function render() {
        syncPhasesFromState();
        const route = document.getElementById('route');
        route.innerHTML = '';
        let totalAll = 0,
          doneAll = 0;

        phases.forEach((phase, idx) => {
          const total = phase.tasks.length;
          const done = phase.tasks.filter((t) => state[t.id]).length;
          const phaseDue =
            phase.tasks
              .map((t) => state[t.id + '__due'])
              .filter(Boolean)
              .sort()
              .at(-1) || '';
          const phaseDueStatus = dueStatus(phaseDue, done === total);
          const phaseDueClass = phaseDueStatus === 'done-neutral' ? 'none' : phaseDueStatus;
          totalAll += total;
          doneAll += done;

          const phaseEl = document.createElement('div');
          phaseEl.className = 'phase';
          phaseEl.dataset.phase = phase.id;

          const markerClass = total > 0 && done === total ? 'complete' : done > 0 ? 'partial' : '';
          const markerContent = total > 0 && done === total ? CHECK_SVG : idx + 1;

          phaseEl.innerHTML = `
      <div class="phase-marker ${markerClass}">${total > 0 && done === total ? CHECK_SVG : idx + 1}</div>
      <div class="phase-card">
        <div class="phase-head" data-toggle="${phase.id}">
          <div class="phase-titles">
            <p class="phase-title">${escapeHtml(phase.title)}</p>
            <div class="phase-desc">${escapeHtml(phase.desc)}</div>
            <div class="phase-deadline">Общий срок: ${
              phaseDue
                ? `<span class="due-badge ${phaseDueClass}">${formatDue(phaseDue)}</span>`
                : '<span class="due-badge none">не задан</span>'
            }</div>
          </div>
          <svg class="chevron" viewBox="0 0 20 20" fill="none"><path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div class="phase-count">${done}/${total}</div>
          <button class="edit-btn" type="button" data-form-toggle="editPhaseForm-${phase.id}" title="Редактировать категорию" aria-label="Редактировать категорию">✎</button>
          <button class="delete-btn" type="button" data-delete-phase="${phase.id}" title="Удалить категорию" aria-label="Удалить категорию">×</button>
        </div>
        <div class="phase-body">
          <form class="add-form" id="editPhaseForm-${phase.id}" data-edit-phase="${phase.id}">
            <input name="title" type="text" value="${escapeHtml(phase.title)}" required>
            <input name="desc" type="text" value="${escapeHtml(phase.desc)}" placeholder="Краткое описание">
            <button class="add-btn" type="submit">Сохранить изменения</button>
          </form>
          ${phase.tasks
            .map((t) => {
              const due = state[t.id + '__due'] || '';
              const st = dueStatus(due, !!state[t.id]);
              const badgeClass = st === 'done-neutral' ? 'none' : st;
              const badgeLabel = due ? (st === 'overdue' ? `Просрочено · ${formatDue(due)}` : formatDue(due)) : '';
              return `
            <div class="task ${state[t.id] ? 'done' : ''}" data-task="${t.id}">
              <div class="task-check" data-check="${t.id}">${state[t.id] ? CHECK_SVG : ''}</div>
              <div class="task-text">
                <div class="task-title">${escapeHtml(t.title)}</div>
                ${t.note ? `<div class="task-note clamped">${escapeHtml(t.note)}</div>` : ''}
                ${t.note ? `<button class="task-note-toggle" type="button" data-note-toggle="${t.id}" title="Показать полностью" aria-label="Показать полностью">Показать полностью</button>` : ''}
                <div class="task-due-row">
                  ${due ? `<span class="due-badge ${badgeClass}">${badgeLabel}</span>` : ''}
                  ${state[t.id + '__completedAt'] ? `<span class="task-completed">Выполнено · ${formatDue(state[t.id + '__completedAt'])}</span>` : ''}
                  <input type="date" class="due-input" data-due="${t.id}" value="${due}" title="Установить срок">
                </div>
                <form class="add-form task-form" id="editTaskForm-${t.id}" data-edit-task="${t.id}">
                  <input name="title" type="text" value="${escapeHtml(t.title)}" required>
                  <input name="note" type="text" value="${escapeHtml(t.note)}" placeholder="Примечание">
                  <input class="due-input" name="due" type="date" value="${due}" title="Срок выполнения">
                  <button class="add-btn" type="submit">Сохранить изменения</button>
                </form>
              </div>
              <button class="edit-btn" type="button" data-form-toggle="editTaskForm-${t.id}" title="Редактировать дело" aria-label="Редактировать дело">✎</button>
              <button class="delete-btn task-remove" type="button" data-delete-task="${t.id}" title="Удалить дело" aria-label="Удалить дело">×</button>
            </div>
          `;
            })
            .join('')}
          <div class="task-add">
            <button class="add-btn secondary" type="button" data-form-toggle="addTaskForm-${phase.id}">+ Добавить дело</button>
            <form class="add-form task-form" id="addTaskForm-${phase.id}" data-add-task="${phase.id}">
              <input name="title" type="text" placeholder="Название дела" required>
              <input name="note" type="text" placeholder="Примечание (необязательно)">
              <input class="due-input" name="due" type="date" title="Срок выполнения">
              <button class="add-btn" type="submit">Добавить</button>
            </form>
          </div>
        </div>
      </div>
    `;
          route.appendChild(phaseEl);
        });

        document.getElementById('overallCount').textContent = `${doneAll}/${totalAll}`;
        const pct = totalAll ? Math.round((doneAll / totalAll) * 100) : 0;
        document.getElementById('overallPct').textContent = pct + '%';
        document.getElementById('overallFill').style.width = pct + '%';

        // wire events
        route.querySelectorAll('[data-toggle]').forEach((el) => {
          el.addEventListener('click', () => {
            el.closest('.phase').classList.toggle('collapsed');
          });
        });
        route.querySelectorAll('[data-check]').forEach((el) => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = el.dataset.check;
            setTaskState(id, !state[id]);
            render();
          });
        });
        route.querySelectorAll('[data-due]').forEach((el) => {
          el.addEventListener('click', (e) => e.stopPropagation());
          el.addEventListener('change', (e) => {
            e.stopPropagation();
            const id = el.dataset.due;
            setDue(id, el.value);
            render();
          });
        });
        route.querySelectorAll('[data-form-toggle]').forEach((button) => {
          button.addEventListener('click', (e) => {
            e.stopPropagation();
            const form = document.getElementById(button.dataset.formToggle);
            form.classList.toggle('open');
            if (form.classList.contains('open')) form.elements.title.focus();
          });
        });
        route.querySelectorAll('[data-add-task]').forEach((form) => {
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = form.elements.title.value.trim();
            if (!title) return;
            const task = { id: makeId('task'), title, note: form.elements.note.value.trim() };
            const phaseId = form.dataset.addTask;
            const customTasks = { ...(state.__customTasks || {}) };
            customTasks[phaseId] = [...(customTasks[phaseId] || []), task];
            saveCustomData('__customTasks', customTasks);
            if (form.elements.due.value) setDue(task.id, form.elements.due.value);
            render();
          });
        });
        route.querySelectorAll('[data-edit-phase]').forEach((form) => {
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = form.elements.title.value.trim();
            if (!title) return;
            saveCustomData('__phaseEdits', {
              ...(state.__phaseEdits || {}),
              [form.dataset.editPhase]: { title, desc: form.elements.desc.value.trim() },
            });
            render();
          });
        });
        route.querySelectorAll('[data-edit-task]').forEach((form) => {
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = form.elements.title.value.trim();
            if (!title) return;
            saveCustomData('__taskEdits', {
              ...(state.__taskEdits || {}),
              [form.dataset.editTask]: { title, note: form.elements.note.value.trim() },
            });
            setDue(form.dataset.editTask, form.elements.due.value);
            render();
          });
        });
        route.querySelectorAll('[data-note-toggle]').forEach((button) => {
          const note = button.previousElementSibling;
          if (note.scrollHeight <= note.clientHeight + 1) button.hidden = true;
          button.addEventListener('click', () => {
            const isClamped = note.classList.toggle('clamped');
            button.textContent = isClamped ? 'Показать полностью' : 'Свернуть описание';
            button.title = isClamped ? 'Показать полностью' : 'Свернуть описание';
            button.setAttribute('aria-label', button.title);
          });
        });
        route.querySelectorAll('[data-delete-task]').forEach((button) => {
          button.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Удалить это дело?')) return;
            saveCustomData('__deletedTasks', [...new Set([...(state.__deletedTasks || []), button.dataset.deleteTask])]);
            render();
          });
        });
        route.querySelectorAll('[data-delete-phase]').forEach((button) => {
          button.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Удалить эту категорию вместе со всеми её делами?')) return;
            saveCustomData('__deletedPhases', [...new Set([...(state.__deletedPhases || []), button.dataset.deletePhase])]);
            render();
          });
        });
      }

      function renderBudget() {
        const tbl = document.getElementById('budgetTable');
        const entries = getBudget();
        const total = entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
        tbl.innerHTML = `
          <thead><tr><th>№</th><th>Статья расходов</th><th>Сумма</th><th></th></tr></thead>
          <tbody>
            ${entries
              .map(
                (entry, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td><input class="budget-input" data-budget-field="name" data-budget-id="${entry.id}" value="${escapeHtml(entry.name)}" aria-label="Статья расходов ${index + 1}"></td>
                    <td><input class="budget-input amount" data-budget-field="amount" data-budget-id="${entry.id}" type="number" min="0" step="1" value="${Number(entry.amount) || 0}" aria-label="Сумма ${index + 1}"></td>
                    <td><button class="delete-btn" type="button" data-delete-budget="${entry.id}" title="Удалить запись" aria-label="Удалить запись">×</button></td>
                  </tr>`,
              )
              .join('')}
            <tr class="total"><td colspan="2">Итого</td><td id="budgetTotal">${fmt(total)}</td><td></td></tr>
          </tbody>`;

        tbl.querySelectorAll('[data-budget-field]').forEach((input) => {
          input.addEventListener('input', () => {
            const liveTotal = [...tbl.querySelectorAll('[data-budget-field="amount"]')].reduce(
              (sum, field) => sum + (Number(field.value) || 0),
              0,
            );
            document.getElementById('budgetTotal').textContent = fmt(liveTotal);
          });
          input.addEventListener('change', () => {
            const updated = entries.map((entry) => {
              if (entry.id !== input.dataset.budgetId) return entry;
              return input.dataset.budgetField === 'amount'
                ? { ...entry, amount: Math.max(0, Number(input.value) || 0) }
                : { ...entry, name: input.value.trim() || 'Без названия' };
            });
            saveBudget(updated);
            renderBudget();
          });
        });
        tbl.querySelectorAll('[data-delete-budget]').forEach((button) => {
          button.addEventListener('click', () => {
            if (!confirm('Удалить эту статью расходов?')) return;
            saveBudget(entries.filter((entry) => entry.id !== button.dataset.deleteBudget));
            renderBudget();
          });
        });
      }

      function renderIncome() {
        const tbl = document.getElementById('incomeTable');
        const entries = getIncome();
        const total = entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
        tbl.innerHTML = `
          <thead><tr><th>№</th><th>Источник дохода</th><th>Сумма</th><th></th></tr></thead>
          <tbody>
            ${entries
              .map(
                (entry, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td><input class="budget-input" data-income-field="name" data-income-id="${entry.id}" value="${escapeHtml(entry.name)}" aria-label="Источник дохода ${index + 1}"></td>
                    <td><input class="budget-input amount" data-income-field="amount" data-income-id="${entry.id}" type="number" min="0" step="1" value="${Number(entry.amount) || 0}" aria-label="Сумма дохода ${index + 1}"></td>
                    <td><button class="delete-btn" type="button" data-delete-income="${entry.id}" title="Удалить запись" aria-label="Удалить запись">×</button></td>
                  </tr>`,
              )
              .join('')}
            <tr class="total"><td colspan="2">Итого</td><td id="incomeTotal">${fmt(total)}</td><td></td></tr>
          </tbody>`;

        tbl.querySelectorAll('[data-income-field]').forEach((input) => {
          input.addEventListener('input', () => {
            const liveTotal = [...tbl.querySelectorAll('[data-income-field="amount"]')].reduce(
              (sum, field) => sum + (Number(field.value) || 0),
              0,
            );
            document.getElementById('incomeTotal').textContent = fmt(liveTotal);
          });
          input.addEventListener('change', () => {
            const updated = entries.map((entry) => {
              if (entry.id !== input.dataset.incomeId) return entry;
              return input.dataset.incomeField === 'amount'
                ? { ...entry, amount: Math.max(0, Number(input.value) || 0) }
                : { ...entry, name: input.value.trim() || 'Без названия' };
            });
            saveIncome(updated);
            renderIncome();
          });
        });
        tbl.querySelectorAll('[data-delete-income]').forEach((button) => {
          button.addEventListener('click', () => {
            if (!confirm('Удалить этот источник дохода?')) return;
            saveIncome(entries.filter((entry) => entry.id !== button.dataset.deleteIncome));
            renderIncome();
          });
        });
      }

      function renderCustomIncomeTables() {
        const container = document.getElementById('customIncomeTables');
        const tables = getCustomIncomeTables();
        container.innerHTML = tables
          .map(
            (table) => `
              <div class="ref-card income-card" data-income-table="${table.id}">
                <div class="income-table-heading">
                  <div class="ref-title">${escapeHtml(table.title)}</div>
                  <button class="delete-btn" type="button" data-delete-income-table="${table.id}" title="Удалить таблицу" aria-label="Удалить таблицу">×</button>
                </div>
                <div class="ref-sub">Добавляйте источники дохода — общая сумма обновится автоматически.</div>
                <table class="budget"></table>
                <form class="budget-add" data-add-custom-income="${table.id}">
                  <input name="name" type="text" placeholder="Источник дохода" required>
                  <input name="amount" type="number" min="0" step="1" placeholder="Сумма" required>
                  <button class="add-btn" type="submit">Добавить</button>
                </form>
              </div>`,
          )
          .join('');

        tables.forEach((table) => {
          const card = container.querySelector(`[data-income-table="${table.id}"]`);
          const tbl = card.querySelector('table');
          const entries = table.entries || [];
          const total = entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
          tbl.innerHTML = `
            <thead><tr><th>№</th><th>Источник дохода</th><th>Сумма</th><th></th></tr></thead>
            <tbody>
              ${entries
                .map(
                  (entry, index) => `
                    <tr>
                      <td>${index + 1}</td>
                      <td><input class="budget-input" data-custom-income-field="name" data-income-id="${entry.id}" value="${escapeHtml(entry.name)}" aria-label="Источник дохода ${index + 1}"></td>
                      <td><input class="budget-input amount" data-custom-income-field="amount" data-income-id="${entry.id}" type="number" min="0" step="1" value="${Number(entry.amount) || 0}" aria-label="Сумма дохода ${index + 1}"></td>
                      <td><button class="delete-btn" type="button" data-delete-custom-income="${entry.id}" title="Удалить запись" aria-label="Удалить запись">×</button></td>
                    </tr>`,
                )
                .join('')}
              <tr class="total"><td colspan="2">Итого</td><td class="custom-income-total">${fmt(total)}</td><td></td></tr>
            </tbody>`;

          const saveEntries = (updatedEntries) => {
            saveCustomIncomeTables(
              getCustomIncomeTables().map((item) => (item.id === table.id ? { ...item, entries: updatedEntries } : item)),
            );
            renderCustomIncomeTables();
          };
          tbl.querySelectorAll('[data-custom-income-field]').forEach((input) => {
            input.addEventListener('input', () => {
              const liveTotal = [...tbl.querySelectorAll('[data-custom-income-field="amount"]')].reduce(
                (sum, field) => sum + (Number(field.value) || 0),
                0,
              );
              tbl.querySelector('.custom-income-total').textContent = fmt(liveTotal);
            });
            input.addEventListener('change', () => {
              saveEntries(
                entries.map((entry) => {
                  if (entry.id !== input.dataset.incomeId) return entry;
                  return input.dataset.customIncomeField === 'amount'
                    ? { ...entry, amount: Math.max(0, Number(input.value) || 0) }
                    : { ...entry, name: input.value.trim() || 'Без названия' };
                }),
              );
            });
          });
          tbl.querySelectorAll('[data-delete-custom-income]').forEach((button) => {
            button.addEventListener('click', () => {
              if (!confirm('Удалить этот источник дохода?')) return;
              saveEntries(entries.filter((entry) => entry.id !== button.dataset.deleteCustomIncome));
            });
          });
          card.querySelector('[data-add-custom-income]').addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const name = form.elements.name.value.trim();
            if (!name) return;
            saveEntries([...entries, { id: makeId('income'), name, amount: Math.max(0, Number(form.elements.amount.value) || 0) }]);
          });
        });

        container.querySelectorAll('[data-delete-income-table]').forEach((button) => {
          button.addEventListener('click', () => {
            if (!confirm('Удалить эту таблицу доходов вместе со всеми записями?')) return;
            saveCustomIncomeTables(getCustomIncomeTables().filter((table) => table.id !== button.dataset.deleteIncomeTable));
            renderCustomIncomeTables();
          });
        });
      }

      document.getElementById('resetBtn').addEventListener('click', () => {
        if (!confirm('Сбросить все отметки у всех?')) return;
        if (firestoreReady) {
          setDoc(stateDocRef, {}).catch((e) => console.error('firestore reset error', e));
        } else {
          state = {};
          try {
            localStorage.setItem('kz-roadmap-state-v1', JSON.stringify(state));
          } catch (e) {}
          render();
        }
      });

      document.querySelector('[data-form-toggle="addPhaseForm"]').addEventListener('click', () => {
        const form = document.getElementById('addPhaseForm');
        form.classList.toggle('open');
        if (form.classList.contains('open')) form.elements.title.focus();
      });
      document.getElementById('addPhaseForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const title = form.elements.title.value.trim();
        if (!title) return;
        const customPhases = [
          ...(state.__customPhases || []),
          { id: makeId('phase'), title, desc: form.elements.desc.value.trim(), tasks: [] },
        ];
        saveCustomData('__customPhases', customPhases);
        form.reset();
        form.classList.remove('open');
        render();
      });

      document.getElementById('budgetAddForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const name = form.elements.name.value.trim();
        if (!name) return;
        saveBudget([
          ...getBudget(),
          { id: makeId('budget'), name, amount: Math.max(0, Number(form.elements.amount.value) || 0) },
        ]);
        form.reset();
        renderBudget();
      });

      document.getElementById('incomeAddForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const name = form.elements.name.value.trim();
        if (!name) return;
        saveIncome([
          ...getIncome(),
          { id: makeId('income'), name, amount: Math.max(0, Number(form.elements.amount.value) || 0) },
        ]);
        form.reset();
        renderIncome();
      });

      document.getElementById('addIncomeTableBtn').addEventListener('click', () => {
        const form = document.getElementById('incomeTableForm');
        form.classList.toggle('open');
        if (form.classList.contains('open')) form.elements.title.focus();
      });
      document.getElementById('incomeTableForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const title = form.elements.title.value.trim();
        if (!title) return;
        saveCustomIncomeTables([...getCustomIncomeTables(), { id: makeId('income_table'), title, entries: [] }]);
        form.reset();
        form.classList.remove('open');
        renderCustomIncomeTables();
      });

      document.querySelectorAll('[data-delete-default-table]').forEach((button) => {
        button.addEventListener('click', () => {
          const tableType = button.dataset.deleteDefaultTable;
          const tableName = tableType === 'budget' ? 'таблицу трат' : 'таблицу доходов';
          if (!confirm(`Удалить ${tableName}? Записи останутся сохранены.`)) return;
          saveCustomData('__hiddenDefaultTables', [...new Set([...(state.__hiddenDefaultTables || []), tableType])]);
          renderDefaultTableVisibility();
        });
      });

      render(); // первичная отрисовка пустым состоянием, пока грузится Firestore
      renderBudget();
      renderIncome();
      renderCustomIncomeTables();
      renderDefaultTableVisibility();
      const scrollTopBtn = document.getElementById('scrollTopBtn');
      const updateScrollTopButton = () => {
        scrollTopBtn.classList.toggle('is-visible', window.scrollY > 300);
      };
      window.addEventListener('scroll', updateScrollTopButton, { passive: true });
      scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
      updateScrollTopButton();

      initFirestore();
