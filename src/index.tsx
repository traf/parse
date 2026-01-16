import { useEffect, useState, useCallback, useRef } from "react";
import {
  List,
  ActionPanel,
  Action,
  Clipboard,
  getPreferenceValues,
  showToast,
  Toast,
  Icon,
  Color,
  LocalStorage,
} from "@raycast/api";

interface Preferences {
  wpm: string;
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const wpm = parseInt(preferences.wpm) || 400;

  const [clipboardHistory, setClipboardHistory] = useState<
    { id: string; text: string; words: string[] }[]
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWpm, setCurrentWpm] = useState(wpm);
  const wpmOptions = [300, 400, 500, 600, 700];

  // Load saved WPM on mount
  useEffect(() => {
    LocalStorage.getItem<string>("savedWpm").then((saved) => {
      if (saved) setCurrentWpm(parseInt(saved));
    });
  }, []);

  const selectedItem = clipboardHistory.find((item) => item.id === selectedId);
  const words = selectedItem?.words || [];

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const wordsRef = useRef(words);
  wordsRef.current = words;

  useEffect(() => {
    async function loadClipboardHistory() {
      try {
        // Load deleted IDs from storage
        const deletedJson = await LocalStorage.getItem<string>("deletedTexts");
        const deletedTexts: string[] = deletedJson
          ? JSON.parse(deletedJson)
          : [];

        const items: { id: string; text: string; words: string[] }[] = [];

        for (let offset = 0; offset <= 5; offset++) {
          const clipboardText = await Clipboard.readText({ offset });
          if (clipboardText && clipboardText.trim()) {
            const text = clipboardText.trim();
            if (
              !items.some((item) => item.text === text) &&
              !deletedTexts.includes(text)
            ) {
              const wordArray = text.split(/\s+/).filter((w) => w.length > 0);
              if (wordArray.length >= 10) {
                items.push({
                  id: `${offset}-${Date.now()}`,
                  text,
                  words: wordArray,
                });
              }
            }
          }
        }

        if (items.length > 0) {
          setClipboardHistory(items);
          setSelectedId(items[0].id);
          setCurrentIndex(0);
          setIsPlaying(true);
        }
        setIsLoading(false);
      } catch (error) {
        setIsLoading(false);
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to read clipboard",
          message: String(error),
        });
      }
    }
    loadClipboardHistory();
  }, []);

  useEffect(() => {
    const currentWords = wordsRef.current;
    if (
      !isPlaying ||
      currentWords.length === 0 ||
      currentIndex >= currentWords.length
    ) {
      return;
    }

    const baseInterval = 60000 / currentWpm;
    const currentWord = currentWords[currentIndex] || "";
    const hasPunctuation = /[.!?]$/.test(currentWord);
    const delay = hasPunctuation ? baseInterval * 2 : baseInterval;

    intervalRef.current = setTimeout(() => {
      const next = currentIndex + 1;
      if (next >= currentWords.length) {
        setIsPlaying(false);
      } else {
        setCurrentIndex(next);
      }
    }, delay);

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [isPlaying, selectedId, currentWpm, currentIndex]);

  const togglePlayPause = useCallback(() => {
    if (currentIndex >= words.length - 1) {
      setCurrentIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  }, [currentIndex, words.length]);

  const maxWordLength = 15;

  const getCurrentChunk = () => {
    if (words.length === 0) return "";
    let word = words[currentIndex] || "";
    if (word.length > maxWordLength) return "—";
    if (/[[\]()!#*`]/.test(word)) return "—";
    return word;
  };

  // Get middle character index
  const getOrpIndex = (word: string) => {
    return Math.floor(word.length / 2);
  };

  const createWordSvg = (word: string, orpIdx: number) => {
    const fontSize = 56;
    const charWidth = 34;
    const fixedWidth = 600;
    const svgHeight = 400;
    const centerY = svgHeight / 2 + 50;
    const centerX = fixedWidth / 2;

    // Position word so ORP char is at center
    const orpOffset = orpIdx * charWidth + charWidth / 2;
    const startX = centerX - orpOffset;

    const chars = word
      .split("")
      .map((char, i) => {
        const escaped = char
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const fill = i === orpIdx ? "#ef4444" : "#e5e5e5";
        const x = startX + i * charWidth;
        return `<text x="${x}" y="${centerY}" fill="${fill}" font-size="${fontSize}" font-weight="500" font-family="SF Mono, Menlo, Monaco, monospace" dominant-baseline="central">${escaped}</text>`;
      })
      .join("");

    // Progress bar - fixed position, only fill changes
    const progress =
      words.length > 1 ? (currentIndex / (words.length - 1)) * 100 : 0;
    const barWidth = 200;
    const barHeight = 2;
    const barX = (fixedWidth - barWidth) / 2;
    const barY = svgHeight - 40;
    const filledWidth = Math.round((barWidth * progress) / 100);
    const progressBar = `<rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="#333" rx="1"/><rect x="${barX}" y="${barY}" width="${filledWidth}" height="${barHeight}" fill="#ef4444" rx="1"/>`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fixedWidth}" height="${svgHeight}" viewBox="0 0 ${fixedWidth} ${svgHeight}">${chars}${progressBar}</svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const getMarkdown = () => {
    const word = getCurrentChunk();
    if (!word) return "# No Text Found\n\nCopy some text to your clipboard";

    const orpIdx = getOrpIndex(word);
    const svgUrl = createWordSvg(word, orpIdx);

    return `![${word}](${svgUrl})`;
  };

  const selectItem = (id: string) => {
    setSelectedId(id);
    setCurrentIndex(0);
    setIsPlaying(true);
  };

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarPlaceholder="Search clipboard history..."
      onSelectionChange={(id) => id && selectItem(id)}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Select Speed"
          value={String(currentWpm)}
          onChange={(newValue) => {
            const newWpm = parseInt(newValue);
            setCurrentWpm(newWpm);
            LocalStorage.setItem("savedWpm", newValue);
          }}
        >
          {wpmOptions.map((speed) => (
            <List.Dropdown.Item
              key={speed}
              title={`${speed} WPM`}
              value={String(speed)}
            />
          ))}
        </List.Dropdown>
      }
    >
      {clipboardHistory.length === 0 ? (
        <List.EmptyView
          title="Nothing to Parse."
          description="Copy some text first, then open Parse"
        />
      ) : (
        clipboardHistory.map((item) => (
          <List.Item
            key={item.id}
            id={item.id}
            title={
              item.text.slice(0, 60) + (item.text.length > 60 ? "..." : "")
            }
            detail={
              item.id === selectedId ? (
                <List.Item.Detail markdown={getMarkdown()} />
              ) : undefined
            }
            actions={
              <ActionPanel>
                <Action
                  title={isPlaying ? "Pause" : "Play"}
                  icon={isPlaying ? Icon.Pause : Icon.Play}
                  shortcut={{ modifiers: [], key: "space" }}
                  onAction={togglePlayPause}
                />
                <Action.CopyToClipboard
                  title="Copy"
                  content={item.text}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
                <Action
                  title="Delete"
                  icon={{ source: Icon.Trash, tintColor: Color.Red }}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                  onAction={async () => {
                    const deletedJson =
                      await LocalStorage.getItem<string>("deletedTexts");
                    const deletedTexts: string[] = deletedJson
                      ? JSON.parse(deletedJson)
                      : [];
                    deletedTexts.push(item.text);
                    await LocalStorage.setItem(
                      "deletedTexts",
                      JSON.stringify(deletedTexts),
                    );

                    setClipboardHistory((prev) =>
                      prev.filter((i) => i.id !== item.id),
                    );
                    if (selectedId === item.id) {
                      const remaining = clipboardHistory.filter(
                        (i) => i.id !== item.id,
                      );
                      setSelectedId(
                        remaining.length > 0 ? remaining[0].id : null,
                      );
                    }
                    await showToast({
                      style: Toast.Style.Success,
                      title: "Deleted",
                    });
                  }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
