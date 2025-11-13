// global.d.ts
export {}; // превращаем файл в модуль, чтобы declare global работал корректно

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
        };
        expand(): void;
        close(): void;
        // При необходимости добавь сюда другие методы/поля WebApp
      };
    };
  }
}
