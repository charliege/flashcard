import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const STORAGE_KEY = "study-flip-cards";
const CONFIG_STORAGE_KEY = "study-flip-sync-config";

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
const zoomFrontText = document.querySelector("#zoom-front-text");
const zoomBackText = document.querySelector("#zoom-back-text");
const cardCount = document.querySelector("#card-count");
const cardPosition = document.querySelector("#card-position");
const openZoomButton = document.querySelector("#open-zoom");
const closeZoomButton = document.querySelector("#close-zoom");
const zoomFlashcard = document.querySelector("#zoom-flashcard");
const zoomFlipButton = document.querySelector("#zoom-flip");
const zoomBackdrop = document.querySelector("#zoom-backdrop");
const zoomModal = document.querySelector("#zoom-modal");
const openSyncPanelButton = document.querySelector("#open-sync-panel");
const closeSyncPanelButton = document.querySelector("#close-sync-panel");
const syncDrawer = document.querySelector("#sync-drawer");
const syncPanelBackdrop = document.querySelector("#sync-panel-backdrop");
const syncBadge = document.querySelector("#sync-badge");
const syncMessage = document.querySelector("#sync-message");
const prevButton = document.querySelector("#prev-card");
const nextButton = document.querySelector("#next-card");
const flipButton = document.querySelector("#flip-card");
const deleteButton = document.querySelector("#delete-card");
const sampleButton = document.querySelector("#add-sample");
const refreshButton = document.querySelector("#refresh-deck");
const cardForm = document.querySelector("#card-form");
const questionInput = document.querySelector("#question");
const answerInput = document.querySelector("#answer");
const syncForm = document.querySelector("#sync-form");
const syncEmailInput = document.querySelector("#sync-email");
const signOutButton = document.querySelector("#sign-out");
const configForm = document.querySelector("#config-form");
const configUrlInput = document.querySelector("#config-url");
const configKeyInput = document.querySelector("#config-key");

let cards = loadLocalCards();
let currentIndex = 0;
let supabase = null;
let session = null;
let isSaving = false;
let isConfiguredForCloud = false;
let activeSyncMode = "local";

wireEventListeners();
initializeApp();

function wireEventListeners() {
  flashcard.addEventListener("click", flipCard);
  flipButton.addEventListener("click", flipCard);
  openZoomButton.addEventListener("click", openZoomModal);
  closeZoomButton.addEventListener("click", closeZoomModal);
  zoomFlashcard.addEventListener("click", flipZoomCard);
  zoomFlipButton.addEventListener("click", flipZoomCard);
  zoomBackdrop.addEventListener("click", closeZoomModal);

  if (openSyncPanelButton) {
    openSyncPanelButton.addEventListener("click", openSyncPanel);
  }

  if (closeSyncPanelButton) {
    closeSyncPanelButton.addEventListener("click", closeSyncPanel);
  }

  if (syncPanelBackdrop) {
    syncPanelBackdrop.addEventListener("click", closeSyncPanel);
  }

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

  deleteButton.addEventListener("click", async () => {
    if (!cards.length || isSaving) return;

    const cardToDelete = cards[currentIndex];

    if (isCloudActive()) {
      await deleteCloudCard(cardToDelete.id);
      return;
    }

    cards.splice(currentIndex, 1);

    if (currentIndex >= cards.length) {
      currentIndex = Math.max(0, cards.length - 1);
    }

    persistLocalCards(cards);
    renderCard();
  });

  sampleButton.addEventListener("click", async () => {
    if (isSaving) return;

    if (isCloudActive()) {
      await addSampleCardsToCloud();
      return;
    }

    cards = mergeCards(cards, buildSampleCards());
    persistLocalCards(cards);
    currentIndex = Math.max(0, cards.length - 1);
    renderCard();
    setSyncState("local", "Sample cards added to this device.");
  });

  refreshButton.addEventListener("click", async () => {
    if (!isCloudActive()) {
      renderCard();
      return;
    }

    await loadCloudCards({
      preserveCurrentCardId: getCurrentCardId(),
      statusMessage: "Deck refreshed from the cloud.",
    });
  });

  cardForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const question = questionInput.value.trim();
    const answer = answerInput.value.trim();

    if (!question || !answer || isSaving) return;

    if (isCloudActive()) {
      await addCloudCard(question, answer);
      return;
    }

    cards.push(createCard(question, answer));
    currentIndex = cards.length - 1;
    persistLocalCards(cards);
    renderCard();
    cardForm.reset();
    questionInput.focus();
  });

  syncForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabase) {
      setSyncState(
        "local",
        "Cloud sync is not connected yet. Add your Supabase settings first.",
      );
      return;
    }

    const email = syncEmailInput.value.trim();

    if (!email) return;

    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setSyncState("error", error.message);
      return;
    }

    setSyncState(
      "ready",
      "Magic link sent. Open it on this device to connect your deck.",
    );
    syncForm.reset();
  });

  signOutButton.addEventListener("click", async () => {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();

    if (error) {
      setSyncState("error", error.message);
      return;
    }

    session = null;
    cards = loadLocalCards();
    currentIndex = 0;
    renderCard();
    setSyncState(
      isConfiguredForCloud ? "ready" : "local",
      isConfiguredForCloud
        ? "Signed out. Local cards are still available on this device."
        : "Using this device only.",
    );
  });

  configForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const supabaseUrl = configUrlInput.value.trim();
    const supabaseKey = configKeyInput.value.trim();

    if (!supabaseUrl || !supabaseKey) {
      setSyncState("error", "Add both a Supabase URL and publishable key.");
      return;
    }

    localStorage.setItem(
      CONFIG_STORAGE_KEY,
      JSON.stringify({ supabaseUrl, supabaseKey }),
    );

    setSyncState("ready", "Cloud settings saved on this device. Reloading now.");
    window.setTimeout(() => window.location.reload(), 450);
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !isCloudActive() || isSaving) {
      return;
    }

    await loadCloudCards({
      preserveCurrentCardId: getCurrentCardId(),
      quiet: true,
    });
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      syncDrawer &&
      syncDrawer.classList.contains("is-open")
    ) {
      closeSyncPanel();
    }

    if (
      event.key === "Escape" &&
      zoomModal &&
      !zoomModal.hidden
    ) {
      closeZoomModal();
    }
  });
}

async function initializeApp() {
  hydrateConfigForm();
  renderCard();

  const cloudConfig = getCloudConfig();

  if (!cloudConfig) {
    setSyncState(
      "local",
      "Using this device only. Add Supabase below when you want phone and laptop sync.",
    );
    return;
  }

  try {
    supabase = createClient(cloudConfig.supabaseUrl, cloudConfig.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    isConfiguredForCloud = true;
  } catch (error) {
    setSyncState(
      "error",
      `Could not start cloud sync: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return;
  }

  const {
    data: { session: existingSession },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    setSyncState("error", error.message);
    return;
  }

  session = existingSession;
  cleanupAuthRedirectHash();

  supabase.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;

    if (!session) {
      cards = loadLocalCards();
      currentIndex = 0;
      renderCard();
      setSyncState(
        "ready",
        "Cloud sync is connected. Sign in with the same email on each device.",
      );
      return;
    }

    await loadCloudCards({
      preserveCurrentCardId: getCurrentCardId(),
      statusMessage: `Signed in as ${session.user.email}.`,
    });
  });

  if (!session) {
    setSyncState(
      "ready",
      "Cloud sync is connected. Sign in with the same email on each device.",
    );
    return;
  }

  await loadCloudCards({
    preserveCurrentCardId: getCurrentCardId(),
    statusMessage: `Signed in as ${session.user.email}.`,
  });
}

async function loadCloudCards(options = {}) {
  if (!supabase || !session) return;

  const { preserveCurrentCardId = null, quiet = false, statusMessage = null } = options;
  let finalMessage = statusMessage ?? `Signed in as ${session.user.email}.`;

  const { data, error } = await supabase
    .from("flashcards")
    .select("id, question, answer, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    setSyncState("error", error.message);
    return;
  }

  let remoteCards = normalizeCards(data ?? []);

  if (!remoteCards.length) {
    const importedCards = await importLocalCardsIntoCloud();

    if (importedCards.length) {
      remoteCards = importedCards;

      if (!quiet) {
        finalMessage = "Imported your current local deck into the cloud for this account.";
      }
    }
  }

  cards = remoteCards;
  persistLocalCards(cards);
  syncEmailInput.value = session.user.email ?? "";
  restoreCurrentIndex(preserveCurrentCardId);
  renderCard();

  if (!quiet) {
    setSyncState("synced", finalMessage);
  }
}

async function importLocalCardsIntoCloud() {
  if (!supabase || !session) return [];

  const localCards = loadLocalCards();

  if (!localCards.length) {
    return [];
  }

  const payload = localCards.map((card) => ({
    user_id: session.user.id,
    question: card.question,
    answer: card.answer,
  }));

  const { data, error } = await supabase
    .from("flashcards")
    .insert(payload)
    .select("id, question, answer, created_at");

  if (error) {
    setSyncState("error", error.message);
    return [];
  }

  return normalizeCards(data ?? []);
}

async function addCloudCard(question, answer) {
  if (!supabase || !session) return;

  isSaving = true;
  setSyncState("synced", "Saving card to the cloud...");

  const { data, error } = await supabase
    .from("flashcards")
    .insert({
      user_id: session.user.id,
      question,
      answer,
    })
    .select("id, question, answer, created_at")
    .single();

  isSaving = false;

  if (error) {
    setSyncState("error", error.message);
    return;
  }

  cards.push(normalizeCards([data])[0]);
  currentIndex = cards.length - 1;
  persistLocalCards(cards);
  renderCard();
  cardForm.reset();
  questionInput.focus();
  setSyncState("synced", "Card saved and synced.");
}

async function deleteCloudCard(cardId) {
  if (!supabase || !session) return;

  isSaving = true;
  setSyncState("synced", "Deleting card from the cloud...");

  const { error } = await supabase.from("flashcards").delete().eq("id", cardId);

  isSaving = false;

  if (error) {
    setSyncState("error", error.message);
    return;
  }

  cards = cards.filter((card) => card.id !== cardId);

  if (currentIndex >= cards.length) {
    currentIndex = Math.max(0, cards.length - 1);
  }

  persistLocalCards(cards);
  renderCard();
  setSyncState("synced", "Card deleted.");
}

async function addSampleCardsToCloud() {
  if (!supabase || !session) return;

  const mergedCards = mergeCards(cards, buildSampleCards());
  const missingCards = mergedCards.filter(
    (mergedCard) =>
      !cards.some(
        (card) =>
          card.question === mergedCard.question && card.answer === mergedCard.answer,
      ),
  );

  if (!missingCards.length) {
    setSyncState("synced", "Sample cards are already in your synced deck.");
    return;
  }

  isSaving = true;
  setSyncState("synced", "Adding sample cards to the cloud...");

  const { data, error } = await supabase
    .from("flashcards")
    .insert(
      missingCards.map((card) => ({
        user_id: session.user.id,
        question: card.question,
        answer: card.answer,
      })),
    )
    .select("id, question, answer, created_at");

  isSaving = false;

  if (error) {
    setSyncState("error", error.message);
    return;
  }

  cards = [...cards, ...normalizeCards(data ?? [])];
  currentIndex = cards.length - 1;
  persistLocalCards(cards);
  renderCard();
  setSyncState("synced", "Sample cards added.");
}

function flipCard() {
  if (!cards.length) return;
  flashcard.classList.toggle("is-flipped");
  syncZoomFlipState();
}

function flipZoomCard() {
  if (!cards.length) return;
  zoomFlashcard.classList.toggle("is-flipped");
  syncMainFlipState();
}

function renderCard() {
  flashcard.classList.remove("is-flipped");
  zoomFlashcard.classList.remove("is-flipped");

  if (!cards.length) {
    const emptyBackText = isCloudActive()
      ? "Add a card and it will sync across your signed-in devices."
      : "Add one with the form to start your deck.";

    setCardText("No cards yet", emptyBackText);
    cardCount.textContent = "0 cards";
    cardPosition.textContent = "Card 0 of 0";
    setDisabledState(true);
    return;
  }

  const currentCard = cards[currentIndex];
  setCardText(currentCard.question, currentCard.answer);
  cardCount.textContent = `${cards.length} card${cards.length === 1 ? "" : "s"}`;
  cardPosition.textContent = `Card ${currentIndex + 1} of ${cards.length}`;
  setDisabledState(false);
}

function setDisabledState(isDisabled) {
  prevButton.disabled = isDisabled;
  nextButton.disabled = isDisabled;
  flipButton.disabled = isDisabled;
  deleteButton.disabled = isDisabled;
  openZoomButton.disabled = isDisabled;
  zoomFlipButton.disabled = isDisabled;
}

function setCardText(front, back) {
  frontText.textContent = front;
  backText.textContent = back;
  zoomFrontText.textContent = front;
  zoomBackText.textContent = back;
}

function setSyncState(mode, message) {
  activeSyncMode = mode;
  syncBadge.textContent =
    mode === "synced"
      ? "Cloud synced"
      : mode === "ready"
        ? "Cloud ready"
        : mode === "error"
          ? "Sync issue"
          : "Local only";

  syncBadge.dataset.mode = mode;
  syncMessage.textContent = message;

  if (openSyncPanelButton) {
    openSyncPanelButton.textContent =
      mode === "synced"
        ? "Cloud Synced"
        : mode === "ready"
          ? "Cloud Ready"
          : mode === "error"
            ? "Sync Issue"
            : "Cloud Sync";
  }

  signOutButton.disabled = !isCloudActive();
  refreshButton.disabled = !isCloudActive();
}

function openSyncPanel() {
  if (!syncDrawer || !syncPanelBackdrop || !openSyncPanelButton) return;

  syncDrawer.hidden = false;
  syncDrawer.classList.add("is-open");
  syncDrawer.setAttribute("aria-hidden", "false");
  openSyncPanelButton.setAttribute("aria-expanded", "true");
  syncPanelBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSyncPanel() {
  if (!syncDrawer || !syncPanelBackdrop || !openSyncPanelButton) return;

  syncDrawer.classList.remove("is-open");
  syncDrawer.setAttribute("aria-hidden", "true");
  openSyncPanelButton.setAttribute("aria-expanded", "false");
  syncPanelBackdrop.hidden = true;

  if (zoomModal.hidden) {
    document.body.style.overflow = "";
  }

  window.setTimeout(() => {
    if (!syncDrawer.classList.contains("is-open")) {
      syncDrawer.hidden = true;
    }
  }, 280);
}

function openZoomModal() {
  if (!cards.length) return;

  zoomModal.hidden = false;
  zoomModal.setAttribute("aria-hidden", "false");
  zoomBackdrop.hidden = false;
  syncZoomFlipState();
  document.body.style.overflow = "hidden";
}

function closeZoomModal() {
  zoomModal.hidden = true;
  zoomModal.setAttribute("aria-hidden", "true");
  zoomBackdrop.hidden = true;

  if (!syncDrawer.classList.contains("is-open")) {
    document.body.style.overflow = "";
  }
}

function syncZoomFlipState() {
  zoomFlashcard.classList.toggle("is-flipped", flashcard.classList.contains("is-flipped"));
}

function syncMainFlipState() {
  flashcard.classList.toggle("is-flipped", zoomFlashcard.classList.contains("is-flipped"));
}

function loadLocalCards() {
  const savedCards = localStorage.getItem(STORAGE_KEY);

  if (!savedCards) {
    return buildSampleCards();
  }

  try {
    const parsedCards = JSON.parse(savedCards);
    const normalizedCards = normalizeCards(parsedCards);
    return normalizedCards.length ? normalizedCards : [];
  } catch {
    return buildSampleCards();
  }
}

function persistLocalCards(cardsToStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cardsToStore));
}

function buildSampleCards() {
  return sampleCards.map((card) => createCard(card.question, card.answer));
}

function createCard(question, answer, partial = {}) {
  return {
    id: partial.id ?? crypto.randomUUID(),
    question: question.trim(),
    answer: answer.trim(),
    created_at: partial.created_at ?? new Date().toISOString(),
  };
}

function normalizeCards(cardList) {
  return (cardList ?? [])
    .filter(
      (card) =>
        typeof card?.question === "string" &&
        typeof card?.answer === "string" &&
        card.question.trim() &&
        card.answer.trim(),
    )
    .map((card) => createCard(card.question, card.answer, card));
}

function mergeCards(existingCards, incomingCards) {
  const uniqueCards = new Map();

  for (const card of [...existingCards, ...incomingCards]) {
    const key = `${card.question}:::${card.answer}`;

    if (!uniqueCards.has(key)) {
      uniqueCards.set(key, card);
    }
  }

  return [...uniqueCards.values()];
}

function getCloudConfig() {
  const savedConfig = readSavedConfig();
  const fileConfig = window.STUDY_FLIP_CONFIG ?? {};
  const config = {
    supabaseUrl: savedConfig.supabaseUrl || fileConfig.supabaseUrl || "",
    supabaseKey: savedConfig.supabaseKey || fileConfig.supabaseKey || "",
  };

  if (!config.supabaseUrl || !config.supabaseKey) {
    return null;
  }

  return config;
}

function readSavedConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function hydrateConfigForm() {
  const savedConfig = readSavedConfig();
  const fileConfig = window.STUDY_FLIP_CONFIG ?? {};

  configUrlInput.value = savedConfig.supabaseUrl || fileConfig.supabaseUrl || "";
  configKeyInput.value = savedConfig.supabaseKey || fileConfig.supabaseKey || "";
}

function restoreCurrentIndex(preferredCardId) {
  if (!cards.length) {
    currentIndex = 0;
    return;
  }

  const preferredIndex = preferredCardId
    ? cards.findIndex((card) => card.id === preferredCardId)
    : -1;

  if (preferredIndex >= 0) {
    currentIndex = preferredIndex;
    return;
  }

  currentIndex = Math.min(currentIndex, cards.length - 1);
}

function getCurrentCardId() {
  return cards[currentIndex]?.id ?? null;
}

function isCloudActive() {
  return Boolean(supabase && session?.user);
}

function cleanupAuthRedirectHash() {
  if (!window.location.hash.includes("access_token")) {
    return;
  }

  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${window.location.search}`,
  );
}
