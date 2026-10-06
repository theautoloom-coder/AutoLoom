-- =============================================================================
-- Buy rates, munafa and loss are for the owner and admin only.
--
-- The owner's call (6 Oct 2026): staff below them should not see what the
-- maal cost or what the shop made on it. `catalog.view_cost` was also held by
-- the purchase and accounts (Hisaab) roles, so a counter hand who also kept
-- the khata saw the cost and margin on every bill they made. Margin itself
-- (`reports.view_margin`) was already owner/admin only; the screens that used
-- `reports.view` as a stand-in for "may see money" now ask for these two.
-- =============================================================================

delete from public.role_permissions
 where permission = 'catalog.view_cost'
   and role in ('purchase', 'accounts', 'sales', 'warehouse', 'workshop');
