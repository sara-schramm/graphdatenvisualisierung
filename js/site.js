/*
 * Enhanced quiz for section 5 GNN — progress, retry, keyboard shortcuts.
 */
(function () {
  "use strict";

  var questions = [
    {
      id: "q1",
      correct: 0,
      feedback: "Richtig! Ohne festes Gitter und mit variabler Nachbarschaft passt die CNN-Faltung nicht direkt auf Graphen."
    },
    {
      id: "q2",
      correct: 2,
      feedback: "Korrekt! Aggregation sammelt Nachrichten aus der Nachbarschaft, Update aktualisiert den Knotenzustand — analog zu Faltung + Nichtlinearität."
    },
    {
      id: "q3",
      correct: 1,
      feedback: "Genau! Kein reguläres Raster, keine feste Reihenfolge — Topologie statt Gittergeometrie."
    },
    {
      id: "q4",
      correct: 0,
      feedback: "Richtig! Permutation ändert die Matrixdarstellung, nicht die Topologie — deshalb symmetrische Aggregation."
    }
  ];

  function initQuiz(root) {
    if (!root || root.dataset.quizInit === "true") return;
    root.dataset.quizInit = "true";

    var progressBar = root.querySelector(".quiz-progress-bar span");
    var progressText = root.querySelector(".quiz-progress-text");
    var completeEl = root.querySelector(".quiz-complete");
    var current = 0;
    var score = 0;
    var answered = {};

    function showQuestion(index) {
      root.querySelectorAll(".quiz-container").forEach(function (c, i) {
        c.classList.toggle("is-hidden", i !== index);
      });
      if (progressBar) progressBar.style.width = ((index) / questions.length * 100) + "%";
      if (progressText) progressText.textContent = "Frage " + Math.min(index + 1, questions.length) + " von " + questions.length;
    }

    function finishQuiz() {
      root.querySelectorAll(".quiz-container").forEach(function (c) { c.classList.add("is-hidden"); });
      if (progressBar) progressBar.style.width = "100%";
      if (completeEl) {
        completeEl.hidden = false;
        completeEl.querySelector("[data-quiz-score]").textContent = score + " / " + questions.length;
      }
    }

    questions.forEach(function (q, qIndex) {
      var container = root.querySelector("#" + q.id + "-container") ||
        root.querySelectorAll(".quiz-container")[qIndex];
      if (!container) return;

      var options = container.querySelectorAll(".quiz-btn");
      var feedbackEl = container.querySelector(".quiz-feedback");
      var retryBtn = container.querySelector(".quiz-retry-btn");

      options.forEach(function (btn, optIndex) {
        btn.addEventListener("click", function () {
          if (answered[q.id]) return;
          var isCorrect = optIndex === q.correct;
          if (isCorrect) {
            answered[q.id] = true;
            score++;
            btn.classList.add("correct");
            if (feedbackEl) {
              feedbackEl.textContent = q.feedback;
              feedbackEl.style.color = "#155724";
            }
            options.forEach(function (o) { o.disabled = true; });
            if (retryBtn) retryBtn.hidden = true;
            setTimeout(function () {
              current++;
              if (current < questions.length) showQuestion(current);
              else finishQuiz();
            }, 1200);
          } else {
            btn.classList.add("wrong");
            options[q.correct].classList.add("correct");
            if (feedbackEl) {
              feedbackEl.textContent = "Nicht ganz — tippe auf „Nochmal versuchen“ oder wähle erneut.";
              feedbackEl.style.color = "#721c24";
            }
            btn.disabled = true;
            if (retryBtn) {
              retryBtn.hidden = false;
              retryBtn.textContent = "Nochmal versuchen";
            }
          }
        });
      });

      if (retryBtn) {
        retryBtn.addEventListener("click", function () {
          options.forEach(function (o) {
            o.disabled = false;
            o.classList.remove("correct", "wrong");
          });
          if (feedbackEl) feedbackEl.textContent = "";
          retryBtn.hidden = true;
        });
      }
    });

    root.addEventListener("keydown", function (e) {
      if (e.key >= "1" && e.key <= "3") {
        var container = root.querySelectorAll(".quiz-container:not(.is-hidden)")[0];
        if (!container) return;
        var idx = +e.key - 1;
        var btns = container.querySelectorAll(".quiz-btn");
        if (btns[idx] && !btns[idx].disabled) btns[idx].click();
      }
    });

    showQuestion(0);
  }

  function initReveal() {
    if (!window.IntersectionObserver) {
      document.querySelectorAll(".reveal-on-scroll").forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal-on-scroll").forEach(function (el) {
      obs.observe(el);
    });
  }

  function initAll() {
    document.querySelectorAll(".quiz-root").forEach(initQuiz);
    initReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
