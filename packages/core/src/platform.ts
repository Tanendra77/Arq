export interface IconPackShape {
  id: string;          // category/slug
  name: string;
  category: string;
  file: string;
  w: number;
  h: number;
  keywords: string[];
  needsName?: boolean;
}

export interface IconPackManifest {
  version: 1;
  id: string;
  name: string;
  count: number;
  shapes: IconPackShape[];
}

export interface IconPack {
  manifest: IconPackManifest;
  svgs: Record<string, string>; // shape id -> sanitized SVG text
}

export interface Platform {
  openDocument(): Promise<{ path?: string; text: string } | null>;
  saveDocument(text: string, path?: string): Promise<string | null>;
  exportFile(data: string | Uint8Array, name: string, mime: string): Promise<void>;
  pickIconPackFile(): Promise<{ name: string; text: string } | null>;
  iconPacks: {
    list(): Promise<IconPackManifest[]>;
    get(id: string): Promise<IconPack | null>;
    put(pack: IconPack): Promise<void>;
    remove(id: string): Promise<void>;
  };
}
