import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookPlus, Library, Hash, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAsync, errorMessage } from "@/lib/useAsync";
import { getBooks, importSampleBook } from "@/api/endpoints";
import type { Book } from "@/api/types";
import { ImportBookModal } from "./ImportBookModal";

function titleToHue(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function titleInitials(title: string): string {
  const words = title.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function BookCover({ book }: { book: Book }) {
  if (book.coverUrl) {
    return (
      <img src={book.coverUrl} alt={book.title} className="h-36 w-full rounded-lg object-cover" />
    );
  }

  const hue = titleToHue(book.title);
  return (
    <div
      className="flex h-36 w-full items-center justify-center rounded-lg border border-border-subtle"
      style={{
        background: `linear-gradient(135deg, hsl(${hue},28%,18%) 0%, hsl(${(hue + 30) % 360},22%,24%) 100%)`,
      }}
    >
      <span
        className="select-none text-2xl font-semibold tracking-wide"
        style={{ color: `hsl(${hue},60%,72%)` }}
      >
        {titleInitials(book.title)}
      </span>
    </div>
  );
}

export function BooksScreen() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toast = useToast();
  const booksState = useAsync<Book[]>((s) => getBooks(s), []);
  const [importOpen, setImportOpen] = useState(false);
  const [importingSample, setImportingSample] = useState(false);

  const books = booksState.data ?? [];

  async function onImportSample() {
    setImportingSample(true);
    try {
      await importSampleBook();
      toast.success(t("books.sampleImported"));
      booksState.reload();
    } catch (err) {
      toast.error(errorMessage(err) || t("books.sampleFailed"));
    } finally {
      setImportingSample(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("books.libraryTitle")}
        description={t("books.librarySubtitle")}
        actions={
          <Button variant="primary" onClick={() => setImportOpen(true)}>
            <BookPlus className="h-4 w-4" />
            {t("books.uploadBook")}
          </Button>
        }
      />

      {booksState.loading ? (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : booksState.error ? (
        <ErrorBanner message={booksState.error} onRetry={booksState.reload} />
      ) : books.length === 0 ? (
        <EmptyState
          icon={<Library className="h-5 w-5" />}
          title={t("books.emptyTitle")}
          description={t("books.emptyDescription")}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" onClick={() => setImportOpen(true)}>
                <BookPlus className="h-4 w-4" />
                {t("books.uploadFirstBook")}
              </Button>
              <Button
                variant="secondary"
                loading={importingSample}
                disabled={importingSample}
                onClick={onImportSample}
              >
                {!importingSample && <Sparkles className="h-4 w-4" />}
                {t("books.trySample")}
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] stagger">
          {books.map((book) => (
            <Card
              key={book.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/libri/${book.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/libri/${book.id}`);
                }
              }}
              className="group flex cursor-pointer flex-col gap-3 p-3 transition-[transform,border-color,background-color] duration-150 ease-out-strong hover:border-border-strong hover:bg-bg-hover active:scale-[0.99]"
            >
              <BookCover book={book} />

              <div className="min-w-0">
                <h3 className="line-clamp-2 text-sm font-semibold text-content-primary">
                  {book.title}
                </h3>
                {book.author && (
                  <p className="mt-0.5 truncate text-xs text-content-tertiary">{book.author}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {book.language && <Badge>{book.language}</Badge>}
                {book.baseHashtags && book.baseHashtags.length > 0 ? (
                  <Badge tone="accent">
                    <Hash className="h-3 w-3" />
                    {t("books.baseHashtags", { count: book.baseHashtags.length })}
                  </Badge>
                ) : (
                  <Badge tone="neutral">{t("books.noBaseHashtags")}</Badge>
                )}
              </div>

              {book.updatedAt != null && (
                <p className="text-2xs text-content-faint">
                  {t("books.modifiedDate", {
                    date: new Date(book.updatedAt).toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }),
                  })}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <ImportBookModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => booksState.reload()}
      />
    </div>
  );
}
