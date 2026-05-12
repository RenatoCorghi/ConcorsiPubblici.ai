-- Create indexes to speed up GA scraping and VIP generation
CREATE INDEX IF NOT EXISTS idx_provvedimenti_ga_sede_anno ON provvedimenti_ga (sede_slug, anno_pubblicazione);
CREATE INDEX IF NOT EXISTS idx_provvedimenti_ga_text_presence ON provvedimenti_ga (testo_completo) WHERE testo_completo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provvedimenti_ga_tipo ON provvedimenti_ga (tipo_provvedimento);
