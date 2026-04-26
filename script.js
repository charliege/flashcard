const STORAGE_KEY = "study-flip-cards";

const sampleCards = [
  {
    question: "What is active recall?",
    answer: "Testing yourself from memory instead of only rereading notes.",
  },
  {
    question: "Why do flash cards help?",
    answer: "They make recall fast, repeatable, and easy to review in short sessions.",
  },
  {
    question: "How do I use this site?",
    answer: "Flip the card, move through the deck, and add your own cards on the right.",
  },
];

const flashcard = document.querySelector("#flashcard");
const frontText = document.querySelector("#card-front-text");
const backText = document.querySelector("#card-back-text");
const cardCount = document.querySelector("#card-count");
const cardPosition = document.querySelector("#card-position");
const prevButton = document.querySelector("#prev-card");
const nextButton = document.querySelector("#next-card");
const flipButton = document.querySelector("#flip-card");
const deleteButton = document.querySelector("#delete-card");
const resetButton = document.querySelector("#reset-sample");
const cardForm = document.querySelector("#card-form");
const questionInput = document.querySelector("#question");
const answerInput = document.querySelector("#answer");

let cards = loadCards();
let currentIndex = 0;

renderCard();

flashcard.addEventListener("click", flipCard);
flipButton.addEventListener("click", flipCard);

prevButton.addEventListener("click", () => {
  if (!cards.length) return;
  currentIndex = (currentIndex - 1 + cards.length) % cards.length;
  renderCard();
});

nextButton.addEventListener("click", () => {
  if (!cards.length) return;
  currentIndex = (currentIndex + 1) % cards.length;
  renderCard();
});

deleteButton.addEventListener("click", () => {
  if (!cards.length) return;

  cards.splice(currentIndex, 1);

  if (currentIndex >= cards.length) {
    currentIndex = Math.max(0, cards.length - 1);
  }

  persistCards();
  renderCard();
});

resetButton.addEventListener("click", () => {
  cards = structuredClone(sampleCards);
  currentIndex = 0;
  persistCards();
  renderCard();
});

cardForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const question = questionInput.value.trim();
  const answer = answerInput.value.trim();

  if (!question || !answer) return;

  cards.push({ question, answer });
  currentIndex = cards.length - 1;
  persistCards();
  renderCard();
  cardForm.reset();
  questionInput.focus();
});

function flipCard() {
  if (!cards.length) return;
  flashcard.classList.toggle("is-flipped");
}

function renderCard() {
  flashcard.classList.remove("is-flipped");

  if (!cards.length) {
    frontText.textContent = "No cards yet";
    backText.textContent = "Add one with the form to start your deck.";
    cardCount.textContent = "0 cards";
    cardPosition.textContent = "Card 0 of 0";
    setDisabledState(true);
    return;
  }

  const currentCard = cards[currentIndex];
  frontText.textContent = currentCard.question;
  backText.textContent = currentCard.answer;
  cardCount.textContent = `${cards.length} card${cards.length === 1 ? "" : "s"}`;
  cardPosition.textContent = `Card ${currentIndex + 1} of ${cards.length}`;
  setDisabledState(false);
}

function setDisabledState(isDisabled) {
  prevButton.disabled = isDisabled;
  nextButton.disabled = isDisabled;
  flipButton.disabled = isDisabled;
  deleteButton.disabled = isDisabled;
}

function loadCards() {
  const savedCards = localStorage.getItem(STORAGE_KEY);

  if (!savedCards) {
    return structuredClone(sampleCards);
  }

  try {
    const parsedCards = JSON.parse(savedCards);

    if (!Array.isArray(parsedCards) || !parsedCards.length) {
      return [];
    }

    return parsedCards.filter(
      (card) =>
        typeof card?.question === "string" &&
        typeof card?.answer === "string" &&
        (card.question.trim() || card.answer.trim()),
    );
  } catch {
    return structuredClone(sampleCards);
  }
}

function persistCards() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}
