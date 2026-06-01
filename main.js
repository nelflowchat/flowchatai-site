// FlowchatAI — interactions légères

// Année dynamique dans le footer
document.getElementById("year").textContent = new Date().getFullYear();

// Animation au scroll : révèle les éléments une fois visibles
const revealEls = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  revealEls.forEach((el) => observer.observe(el));
} else {
  // Fallback : tout afficher
  revealEls.forEach((el) => el.classList.add("visible"));
}

// Boutons « Réserver ma démo » : ouvrent l'agent IA (Voiceflow) au lieu de Calendly
document.querySelectorAll("[data-vf-open]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (window.voiceflow && window.voiceflow.chat) {
      window.voiceflow.chat.open();
    }
  });
});
