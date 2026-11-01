interface Window {
  nerabitDesktop?: {
    onSuggestions(
      callback: (data: {
        misspelledWord: string;
        dictionarySuggestions: string[];
      }) => void,
    ): () => void;
    replaceMisspelling(word: string): void;
    addToDictionary(word: string): void;
    saveImageAs(dataUrl: string): Promise<boolean>;
  };
}
