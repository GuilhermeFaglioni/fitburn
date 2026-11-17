import { useMemo, type ReactNode } from "react";
import { QueryBlockState } from "../../components/QueryBlockState";
import { ShortcutCarousel, ShortcutFrame } from "../../components/ui/ShortcutCarousel";
import { useMyAssessments } from "../../lib/bioimpedance/assessments-api";
import {
  buildBodyShortcutSlides,
  type BodyShortcutSlide,
} from "../../lib/bioimpedance/shortcut";
import { useBioimpedanceConsent } from "../../lib/bioimpedance/useBioimpedanceConsent";

const ERROR_MESSAGE = "Não foi possível carregar sua composição corporal.";
const BODY_LABEL = "Composição corporal";
const BODY_PAGE = "/bioimpedancia";

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <path d="M4 12h16" />
    </svg>
  );
}

export function ShortcutLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="fb-home-shortcut__label">
      {icon}
      {children}
    </span>
  );
}

function Spark({ spark }: { spark: NonNullable<BodyShortcutSlide["spark"]> }) {
  return (
    <svg
      className="fb-home-shortcut__spark"
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={spark.points} />
      <circle cx={spark.last.x} cy={spark.last.y} r="2.5" />
    </svg>
  );
}

function MetricSlideContent({ slide }: { slide: BodyShortcutSlide }) {
  const { delta } = slide;
  return (
    <>
      <ShortcutLabel icon={<ScanIcon />}>Corpo</ShortcutLabel>
      <small className="fb-home-shortcut__caption">{slide.label}</small>
      <b className="fb-home-shortcut__value">
        {slide.value}
        <u>{slide.unit}</u>
      </b>
      {delta ? (
        <span className="fb-home-shortcut__delta" data-good={delta.good || undefined}>
          {delta.trend === "same" ? (
            <>igual desde {delta.since}</>
          ) : (
            <>
              <span aria-hidden="true">{delta.trend === "up" ? "▲" : "▼"} </span>
              <span className="fb-ui-sr-only">{delta.trend === "up" ? "subiu " : "caiu "}</span>
              {delta.amount} desde {delta.since}
            </>
          )}
        </span>
      ) : (
        <span className="fb-home-shortcut__delta">Primeira avaliação</span>
      )}
      {slide.spark && <Spark spark={slide.spark} />}
    </>
  );
}

/** Cartão de uma única mensagem (convite, primeira avaliação): o mesmo carrossel, com um slide só. */
function MessageCarousel({ title, note, action }: { title: string; note: string; action: string }) {
  return (
    <ShortcutCarousel
      label={BODY_LABEL}
      footLink={{ to: BODY_PAGE, label: action }}
      slides={[
        {
          key: "mensagem",
          to: BODY_PAGE,
          children: (
            <>
              <ShortcutLabel icon={<ScanIcon />}>Corpo</ShortcutLabel>
              <small className="fb-home-shortcut__caption">{BODY_LABEL}</small>
              <b className="fb-home-shortcut__headline">{title}</b>
              <span className="fb-home-shortcut__note">{note}</span>
            </>
          ),
        },
      ]}
    />
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <ShortcutFrame label={BODY_LABEL} className="fb-home-shortcut__frame">
      <div className="fb-home-shortcut__frame-body">
        <ShortcutLabel icon={<ScanIcon />}>Corpo</ShortcutLabel>
        {children}
      </div>
    </ShortcutFrame>
  );
}

/**
 * Atalho Corpo do Início (N2, #201): PGC, peso, massa muscular e pontuação InBody da avaliação mais recente, cada
 * um com a variação e a minilinha; tocar abre a evolução na medida. Sem avaliações: o convite para autorizar o
 * registro (sem consentimento) ou o cartão de primeira avaliação (com consentimento). As avaliações da própria
 * pessoa seguem visíveis depois de revogar a autorização (D-042). Carrega, falha e fica sem conexão sozinho.
 */
export function HomeBodyShortcut() {
  const mine = useMyAssessments();
  const assessments = mine.data;
  const empty = assessments !== undefined && assessments.length === 0;
  const { query: consentQuery } = useBioimpedanceConsent(empty);
  const slides = useMemo(
    () => (assessments ? buildBodyShortcutSlides(assessments) : []),
    [assessments],
  );

  if (assessments === undefined) {
    return (
      <Placeholder>
        <QueryBlockState
          className="fb-home__state fb-home-shortcut__state"
          query={mine}
          loading="Carregando…"
          error={ERROR_MESSAGE}
          hasData={false}
        />
      </Placeholder>
    );
  }

  if (empty) {
    const consent = consentQuery.data;
    if (consent === undefined) {
      return (
        <Placeholder>
          <QueryBlockState
            className="fb-home__state fb-home-shortcut__state"
            query={consentQuery}
            loading="Carregando…"
            error={ERROR_MESSAGE}
            hasData={false}
          />
        </Placeholder>
      );
    }
    return consent.consented ? (
      <MessageCarousel
        title="Sua primeira avaliação"
        note="Faça a bioimpedância na recepção e a equipe registra aqui."
        action="Ver composição →"
      />
    ) : (
      <MessageCarousel
        title="Acompanhe sua evolução"
        note="Peso, músculo e gordura a cada bioimpedância."
        action="Autorizar →"
      />
    );
  }

  // Avaliações sem nenhuma das 4 medidas (laudo parcial): o atalho leva à tela completa.
  if (slides.length === 0) {
    return (
      <MessageCarousel
        title="Suas avaliações"
        note="Veja os valores de cada bioimpedância."
        action="Ver composição →"
      />
    );
  }

  return (
    <ShortcutCarousel
      label={BODY_LABEL}
      footLink={{ to: `${BODY_PAGE}?aba=evolucao`, label: "Evolução →" }}
      slides={slides.map((slide) => ({
        key: slide.key,
        to: slide.to,
        children: <MetricSlideContent slide={slide} />,
      }))}
    />
  );
}
