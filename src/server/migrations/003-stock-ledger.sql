
-- v3 stock history; preexisting quantities are explicitly marked as baseline
-- observations, never misrepresented as sales or real historic deliveries.
CREATE TABLE stock_movements (
 id TEXT PRIMARY KEY,
 restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 wine_id TEXT NOT NULL,
 actor_id TEXT REFERENCES users(id),
 delta INTEGER NOT NULL,
 before_stock INTEGER NOT NULL CHECK(before_stock>=0),
 after_stock INTEGER NOT NULL CHECK(after_stock>=0),
 reason TEXT NOT NULL CHECK(reason IN
   ('baseline','opening','import','manual','restock','consumption','loss','correction')),
 note TEXT NOT NULL DEFAULT '',
 request_key TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(restaurant_id,request_key),
 FOREIGN KEY(restaurant_id,wine_id) REFERENCES wines(restaurant_id,id)
);
CREATE INDEX ix_stock_movements_tenant ON stock_movements(restaurant_id,wine_id,created_at);
INSERT INTO stock_movements
 (id,restaurant_id,wine_id,actor_id,delta,before_stock,after_stock,reason,note,request_key,created_at)
SELECT 'baseline-'||id,restaurant_id,id,NULL,stock,0,stock,'baseline',
       'Solde connu lors de la migration v3 ; mouvements antérieurs non disponibles.',
       NULL,updated_at
FROM wines;
