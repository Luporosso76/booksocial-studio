import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookPlus, Library, Hash, ChevronRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, ErrorBanner, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useAsync, errorMessage } from "@/lib/useAsync";
import { getBooks, importSampleBook } from "@/api/endpoints";
import type { Book } from "@/api/types";
import { ImportBookModal } from "./ImportBookModal";

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-content-primary">{t("books.libraryTitle")}</h2>
          <p className="mt-0.5 text-sm text-content-tertiary">{t("books.librarySubtitle")}</p>
        </div>
        <Button variant="primary" onClick={() => setImportOpen(true)}>
          <BookPlus className="h-4 w-4" />
          {t("books.uploadBook")}
        </Button>
      </div>

      {booksState.loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 stagger">
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
              className="group cursor-pointer p-4 transition-[transform,border-color,background-color] duration-150 ease-out-strong hover:border-border-strong hover:bg-bg-hover active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-content-primary">
                    {book.title}
                  </h3>
                  {book.author && (
                    <p className="mt-0.5 truncate text-xs text-content-tertiary">{book.author}</p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-content-faint transition-transform duration-150 ease-out-strong group-hover:translate-x-0.5 group-hover:text-content-secondary" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
