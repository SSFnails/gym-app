import { IMAGE_ALIAS } from './image-alias.ts';

/**
 * Картинки упражнений. Складываются в src/assets/exercises под именем
 * идентификатора — Vite подхватывает их сам, регистрировать ничего не нужно.
 * Файлы уезжают в сборку с хэшами и попадают в офлайн-кеш.
 *
 * Чего здесь нет и не нужно: заглушки. Нет картинки — блок с ней просто
 * не показывается, а название и подпись зоны на экране остаются.
 */
const FILES = import.meta.glob('../assets/exercises/*.{webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const BY_ID: Record<string, string> = {};
for (const [path, url] of Object.entries(FILES)) {
  const id = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  BY_ID[id] = url;
}

export function exerciseImage(catalogId: string): string | null {
  const alias = IMAGE_ALIAS[catalogId];
  return BY_ID[catalogId] ?? (alias ? BY_ID[alias] ?? null : null);
}

export const imageCount = Object.keys(BY_ID).length;
