import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const STORAGE_KEY = "study-flip-cards";
const TOPICS_STORAGE_KEY = "study-flip-topics";
const ACTIVE_TOPIC_STORAGE_KEY = "study-flip-active-topic";
const CONFIG_STORAGE_KEY = "study-flip-sync-config";
const DEFAULT_TOPIC = "General";

const sampleCards = [
  {
    question: "What is active recall?",
    answer: "Testing yourself from memory instead of only rereading notes.",
    topic: DEFAULT_TOPIC,
  },
  {
    question: "Why do flash cards help?",
    answer: "They make recall fast, repeatable, and easy to review in short sessions.",
    topic: DEFAULT_TOPIC,
  },
  {
    question: "How do I use this site?",
    answer: "Flip the card, move through your deck, and add new cards on the right.",
    topic: DEFAULT_TOPIC,
  },
];

const flashcard = document.querySelector("#flashcard");
const frontText = document.querySelector("#card-front-text");
const backText = document.querySelector("#card-back-text");
const zoomFrontText = document.querySelector("#zoom-front-text");
const zoomBackText = document.querySelector("#zoom-back-text");
const cardCount = document.querySelector("#card-count");
const cardPosition = document.querySelector("#card-position");
const topicSelect = document.querySelector("#topic-select");
const activeTopicName = document.querySelector("#active-topic-name");
const topicForm = document.querySelector("#topic-form");
const topicNameInput = document.querySelector("#topic-name");
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
const cardForm = document.querySelector("#card-form");
const questionInput = document.querySelector("#question");
const answerInput = document.querySelector("#answer");
const syncForm = document.querySelector("#sync-form");
const syncEmailInput = document.querySelector("#sync-email");
const signOutButton = document.querySelector("#sign-out");
const configForm = document.querySelector("#config-form");
const configUrlInput = document.querySelector("#config-url");
const configKeyInput = document.querySelector("#config-key");

let allCards = loadLocalCards();
let topicNames = loadLocalTopics(allCards);
let activeTopic = loadActiveTopic();
let currentIndex = 0;
let supabase = null;
let session = null;
let isSaving = false;
let isConfiguredForCloud = false;

ensureTopicState();
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

  topicSelect.addEventListener("change", () => {
    setActiveTopic(topicSelect.value);
  });

  topicForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const rawTopicName = topicNameInput.value.trim();

    if (!rawTopicName || isSaving) return;

    const topicName = normalizeTopicName(rawTopicName);

    if (isCloudActive()) {
      await addCloudTopic(topicName);
      return;
    }

    topicNames = normalizeTopicList([...topicNames, topicName], allCards);
    persistLocalTopics(topicNames);
    setActiveTopic(topicName);
    topicForm.reset();
    topicNameInput.focus();
  });

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
    const visibleCards = getVisibleCards();
    if (!visibleCards.length) return;
    currentIndex = (currentIndex - 1 + visibleCards.length) % visibleCards.length;
    renderCard();
  });

  nextButton.addEventListener("click", () => {
    const visibleCards = getVisibleCards();
    if (!visibleCards.length) return;
    currentIndex = (currentIndex + 1) % visibleCards.length;
    renderCard();
  });

  deleteButton.addEventListener("click", async () => {
    const visibleCards = getVisibleCards();
    if (!visibleCards.length || isSaving) return;

    const cardToDelete = visibleCards[currentIndex];

    if (isCloudActive()) {
      await deleteCloudCard(cardToDelete.id);
      return;
    }

    allCards = allCards.filter((card) => card.id !== cardToDelete.id);
    persistLocalCards(allCards);
    topicNames = normalizeTopicList(topicNames, allCards);
    persistLocalTopics(topicNames);

    if (currentIndex >= getVisibleCards().length) {
      currentIndex = Math.max(0, getVisibleCards().length - 1);
    }

    ensureTopicState();
    renderCard();
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

    allCards.push(createCard(question, answer, activeTopic));
    persistLocalCards(allCards);
    topicNames = normalizeTopicList(topicNames, allCards);
    persistLocalTopics(topicNames);
    currentIndex = getVisibleCards().length - 1;
    renderTopics();
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
      setSyncState("error", formatCloudError(error));
      return;
    }

    setSyncState(
      "ready",
      "Magic link sent. Open it on this device to connect your decks.",
    );
    syncForm.reset();
  });

  signOutButton.addEventListener("click", async () => {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();

    if (error) {
      setSyncState("error", formatCloudError(error));
      return;
    }

    session = null;
    allCards = loadLocalCards();
    topicNames = loadLocalTopics(allCards);
    ensureTopicState();
    currentIndex = 0;
    renderTopics();
    renderCard();
    setSyncState(
      isConfiguredForCloud ? "ready" : "local",
      isConfiguredForCloud
        ? "Signed out. Local decks are still available on this device."
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

    await loadCloudData({
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

    if (event.key === "Escape" && zoomModal && !zoomModal.hidden) {
      closeZoomModal();
    }
  });
}

async function initializeApp() {
  hydrateConfigForm();
  renderTopics();
  renderCard();

  const cloudConfig = getCloudConfig();

  if (!cloudConfig) {
    setSyncState(
      "local",
      "Using this device only. Add Supabase below when you want topics synced everywhere.",
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
    setSyncState("error", formatCloudError(error));
    return;
  }

  session = existingSession;
  cleanupAuthRedirectHash();

  supabase.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;

    if (!session) {
      allCards = loadLocalCards();
      topicNames = loadLocalTopics(allCards);
      ensureTopicState();
      currentIndex = 0;
      renderTopics();
      renderCard();
      setSyncState(
        "ready",
        "Cloud sync is connected. Sign in with the same email on each device.",
      );
      return;
    }

    await loadCloudData({
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

  await loadCloudData({
    preserveCurrentCardId: getCurrentCardId(),
    statusMessage: `Signed in as ${session.user.email}.`,
  });
}

async function loadCloudData(options = {}) {
  if (!supabase || !session) return;

  const { preserveCurrentCardId = null, quiet = false, statusMessage = null } = options;
  let finalMessage = statusMessage ?? `Signed in as ${session.user.email}.`;

  const [cardsResult, topicsResult] = await Promise.all([
    supabase
      .from("flashcards")
      .select("id, question, answer, topic, created_at")
      .order("created_at", { ascending: true }),
    supabase.from("topics").select("name").order("created_at", { ascending: true }),
  ]);

  if (cardsResult.error) {
    setSyncState("error", formatCloudError(cardsResult.error));
    return;
  }

  if (topicsResult.error) {
    setSyncState("error", formatCloudError(topicsResult.error));
    return;
  }

  let remoteCards = normalizeCards(cardsResult.data ?? []);
  let remoteTopics = normalizeTopicList(
    (topicsResult.data ?? []).map((topic) => topic.name),
    remoteCards,
  );

  if (!remoteCards.length && !hasUserTopics(remoteTopics)) {
    const importedState = await importLocalStateToCloud();

    if (importedState) {
      remoteCards = importedState.cards;
      remoteTopics = importedState.topics;

      if (!quiet) {
        finalMessage = "Imported your current decks into the cloud for this account.";
      }
    }
  }

  allCards = remoteCards;
  topicNames = remoteTopics;
  persistLocalCards(allCards);
  persistLocalTopics(topicNames);
  ensureTopicState();
  syncEmailInput.value = session.user.email ?? "";
  restoreCurrentIndex(preserveCurrentCardId);
  renderTopics();
  renderCard();

  if (!quiet) {
    setSyncState("synced", finalMessage);
  }
}

async function importLocalStateToCloud() {
  if (!supabase || !session) return null;

  const localCards = loadLocalCards();
  const localTopics = loadLocalTopics(localCards);

  const topicPayload = localTopics.map((name) => ({
    user_id: session.user.id,
    name,
  }));

  const cardsPayload = localCards.map((card) => ({
    user_id: session.user.id,
    question: card.question,
    answer: card.answer,
    topic: card.topic,
  }));

  if (topicPayload.length) {
    const { error: topicsError } = await supabase.from("topics").insert(topicPayload);

    if (topicsError && !isDuplicateTopicError(topicsError)) {
      setSyncState("error", formatCloudError(topicsError));
      return null;
    }
  }

  let importedCards = [];

  if (cardsPayload.length) {
    const { data, error } = await supabase
      .from("flashcards")
      .insert(cardsPayload)
      .select("id, question, answer, topic, created_at");

    if (error) {
      setSyncState("error", formatCloudError(error));
      return null;
    }

    importedCards = normalizeCards(data ?? []);
  }

  return {
    cards: importedCards,
    topics: normalizeTopicList(localTopics, importedCards),
  };
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
      topic: activeTopic,
    })
    .select("id, question, answer, topic, created_at")
    .single();

  isSaving = false;

  if (error) {
    setSyncState("error", formatCloudError(error));
    return;
  }

  allCards.push(normalizeCards([data])[0]);
  topicNames = normalizeTopicList(topicNames, allCards);
  persistLocalCards(allCards);
  persistLocalTopics(topicNames);
  currentIndex = getVisibleCards().length - 1;
  renderTopics();
  renderCard();
  cardForm.reset();
  questionInput.focus();
  setSyncState("synced", "Card saved and synced.");
}

async function addCloudTopic(topicName) {
  if (!supabase || !session) return;

  if (topicNames.includes(topicName)) {
    setActiveTopic(topicName);
    topicForm.reset();
    return;
  }

  isSaving = true;
  setSyncState("synced", "Creating topic...");

  const { error } = await supabase.from("topics").insert({
    user_id: session.user.id,
    name: topicName,
  });

  isSaving = false;

  if (error && !isDuplicateTopicError(error)) {
    setSyncState("error", formatCloudError(error));
    return;
  }

  topicNames = normalizeTopicList([...topicNames, topicName], allCards);
  persistLocalTopics(topicNames);
  setActiveTopic(topicName);
  topicForm.reset();
  topicNameInput.focus();
  setSyncState("synced", "Topic created.");
}

async function deleteCloudCard(cardId) {
  if (!supabase || !session) return;

  isSaving = true;
  setSyncState("synced", "Deleting card from the cloud...");

  const { error } = await supabase.from("flashcards").delete().eq("id", cardId);

  isSaving = false;

  if (error) {
    setSyncState("error", formatCloudError(error));
    return;
  }

  allCards = allCards.filter((card) => card.id !== cardId);
  persistLocalCards(allCards);
  topicNames = normalizeTopicList(topicNames, allCards);
  persistLocalTopics(topicNames);

  if (currentIndex >= getVisibleCards().length) {
    currentIndex = Math.max(0, getVisibleCards().length - 1);
  }

  ensureTopicState();
  renderTopics();
  renderCard();
  setSyncState("synced", "Card deleted.");
}

function flipCard() {
  if (!getVisibleCards().length) return;
  flashcard.classList.toggle("is-flipped");
  syncZoomFlipState();
}

function flipZoomCard() {
  if (!getVisibleCards().length) return;
  zoomFlashcard.classList.toggle("is-flipped");
  syncMainFlipState();
}

function renderCard() {
  flashcard.classList.remove("is-flipped");
  zoomFlashcard.classList.remove("is-flipped");

  const visibleCards = getVisibleCards();
  activeTopicName.textContent = activeTopic;

  if (!visibleCards.length) {
    setCardText(
      `No cards in ${activeTopic}`,
      "Add a card below to start this topic.",
    );
    cardCount.textContent = "0 cards";
    cardPosition.textContent = "Card 0 of 0";
    setDisabledState(true);
    return;
  }

  const currentCard = visibleCards[currentIndex];
  setCardText(currentCard.question, currentCard.answer);
  cardCount.textContent = `${visibleCards.length} card${visibleCards.length === 1 ? "" : "s"}`;
  cardPosition.textContent = `Card ${currentIndex + 1} of ${visibleCards.length}`;
  setDisabledState(false);
}

function renderTopics() {
  const topics = topicNames.length ? topicNames : [DEFAULT_TOPIC];
  topicSelect.innerHTML = topics
    .map(
      (topic) =>
        `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`,
    )
    .join("");

  topicSelect.value = activeTopic;
  activeTopicName.textContent = activeTopic;
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
  if (!getVisibleCards().length) return;

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
  zoomFlashcard.classList.toggle(
    "is-flipped",
    flashcard.classList.contains("is-flipped"),
  );
}

function syncMainFlipState() {
  flashcard.classList.toggle(
    "is-flipped",
    zoomFlashcard.classList.contains("is-flipped"),
  );
}

function getVisibleCards() {
  return allCards.filter((card) => card.topic === activeTopic);
}

function getCurrentCardId() {
  return getVisibleCards()[currentIndex]?.id ?? null;
}

function setActiveTopic(topic, options = {}) {
  const { persist = true, resetIndex = true } = options;
  activeTopic = normalizeTopicName(topic);

  if (persist) {
    localStorage.setItem(ACTIVE_TOPIC_STORAGE_KEY, activeTopic);
  }

  if (resetIndex) {
    currentIndex = 0;
  }

  ensureTopicState();
  renderTopics();
  renderCard();
}

function ensureTopicState() {
  topicNames = normalizeTopicList(topicNames, allCards);

  if (!topicNames.includes(activeTopic)) {
    activeTopic = topicNames[0] ?? DEFAULT_TOPIC;
    localStorage.setItem(ACTIVE_TOPIC_STORAGE_KEY, activeTopic);
  }
}

function loadLocalCards() {
  const savedCards = localStorage.getItem(STORAGE_KEY);

  if (!savedCards) {
    return buildSampleCards();
  }

  try {
    return normalizeCards(JSON.parse(savedCards));
  } catch {
    return buildSampleCards();
  }
}

function loadLocalTopics(cards) {
  const savedTopics = localStorage.getItem(TOPICS_STORAGE_KEY);

  try {
    const parsedTopics = savedTopics ? JSON.parse(savedTopics) : [];
    return normalizeTopicList(parsedTopics, cards);
  } catch {
    return normalizeTopicList([], cards);
  }
}

function loadActiveTopic() {
  return normalizeTopicName(
    localStorage.getItem(ACTIVE_TOPIC_STORAGE_KEY) || DEFAULT_TOPIC,
  );
}

function persistLocalCards(cardsToStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cardsToStore));
}

function persistLocalTopics(topicsToStore) {
  localStorage.setItem(TOPICS_STORAGE_KEY, JSON.stringify(topicsToStore));
}

function buildSampleCards() {
  return sampleCards.map((card) =>
    createCard(card.question, card.answer, card.topic),
  );
}

function createCard(question, answer, topic = DEFAULT_TOPIC, partial = {}) {
  return {
    id: partial.id ?? crypto.randomUUID(),
    question: question.trim(),
    answer: answer.trim(),
    topic: normalizeTopicName(partial.topic ?? topic),
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
    .map((card) =>
      createCard(card.question, card.answer, card.topic ?? DEFAULT_TOPIC, card),
    );
}

function normalizeTopicList(topics, cards = []) {
  const topicSet = new Set();

  for (const topic of topics ?? []) {
    const normalizedTopic = normalizeTopicName(topic);
    if (normalizedTopic) {
      topicSet.add(normalizedTopic);
    }
  }

  for (const card of cards ?? []) {
    topicSet.add(normalizeTopicName(card.topic));
  }

  if (!topicSet.size) {
    topicSet.add(DEFAULT_TOPIC);
  }

  return [...topicSet];
}

function normalizeTopicName(topic) {
  const value = String(topic ?? "").trim();
  return value || DEFAULT_TOPIC;
}

function restoreCurrentIndex(preferredCardId) {
  const visibleCards = getVisibleCards();

  if (!visibleCards.length) {
    currentIndex = 0;
    return;
  }

  const preferredIndex = preferredCardId
    ? visibleCards.findIndex((card) => card.id === preferredCardId)
    : -1;

  if (preferredIndex >= 0) {
    currentIndex = preferredIndex;
    return;
  }

  currentIndex = Math.min(currentIndex, visibleCards.length - 1);
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

function isCloudActive() {
  return Boolean(supabase && session?.user);
}

function hasUserTopics(topics) {
  return topics.some((topic) => topic !== DEFAULT_TOPIC);
}

function isDuplicateTopicError(error) {
  return (
    error?.code === "23505" ||
    (error?.message ?? "").toLowerCase().includes("duplicate")
  );
}

function formatCloudError(error) {
  const message = error?.message ?? "Unknown cloud error.";

  if (
    message.includes("column") && message.includes("topic") ||
    message.includes("relation") && message.includes("topics")
  ) {
    return "Run supabase-topics-migration.sql in Supabase SQL Editor, then refresh this page.";
  }

  return message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
