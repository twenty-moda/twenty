# Datos de la BD actual (`twentymoda_db`, MariaDB 11.4)

Dump completo: `db/twentymoda_db.sql` (gz: `db/twentymoda_db.sql.gz`). **Contiene datos personales de clientes: no subir a git ni compartir.**
Esquema MySQL (solo `CREATE TABLE`): `db/schema_mysql.sql`. Conteo de filas: `db/row_counts.json`.
Catálogo y envíos sin datos personales, en JSON: `db/catalog_json/`. Configuración en JSON: `db/config_json/` (secretos redactados).

**106 tablas en total, 51 con datos.** Las vacías son módulos de la plantilla genérica (hoteles, proyectos, comisiones, denuncias, etc.) y no se migran.

## Catálogo
| Tabla | Filas |
|---|---:|
| `items` | 387 |
| `item_images` | 413 |
| `item_attribute` | 1990 |
| `attributes` | 4 |
| `item_specifications` | 273 |
| `item_tags` | 1741 |
| `tags` | 34 |
| `categories` | 11 |
| `sub_categories` | 21 |
| `category_sub_category` | 31 |
| `brands` | 1 |
| `related_groups` | 1 |

## Ventas
| Tabla | Filas |
|---|---:|
| `sales` | 14 |
| `sale_details` | 14 |
| `sale_statuses` | 9 |
| `sale_status_traces` | 40 |
| `coupons` | 4 |
| `discount_rules` | 5 |

## Envíos y tiendas
| Tabla | Filas |
|---|---:|
| `delivery_prices` | 1893 |
| `types_delivery` | 5 |
| `stores` | 1 |

## Usuarios y permisos
| Tabla | Filas |
|---|---:|
| `users` | 18 |
| `roles` | 3 |
| `permissions` | 3 |
| `model_has_roles` | 58 |
| `role_has_permissions` | 4 |
| `role_has_menus` | 40 |
| `password_reset_tokens` | 1 |

## Contenido del sitio
| Tabla | Filas |
|---|---:|
| `generals` | 195 |
| `settings` | 5 |
| `system_colors` | 14 |
| `systems` | 31 |
| `sliders` | 3 |
| `posts` | 7 |
| `blog_categories` | 5 |
| `faqs` | 6 |
| `aboutuses` | 4 |
| `strengths` | 5 |
| `indicators` | 4 |
| `testimonies` | 3 |
| `socials` | 3 |
| `web_details` | 2 |
| `ads` | 1 |
| `repository` | 4 |

## Leads
| Tabla | Filas |
|---|---:|
| `subscriptions` | 3 |
| `messages` | 2 |

## Analítica
| Tabla | Filas |
|---|---:|
| `user_sessions` | 7203 |
| `analytics_events` | 1008 |
| `item_clicks` | 582 |

## Técnicas de Laravel (no migrar)
| Tabla | Filas |
|---|---:|
| `migrations` | 298 |
| `jobs` | 4 |

## Tablas vacías (ignorar)

`amenities`, `application_item`, `applications`, `apps`, `benefits`, `bookings`, `cart_analytics`, `case_studies`, `catalogs`, `certifications`, `collections`, `combo_items`, `combos`, `commissions`, `complaints`, `delivery_zones`, `discount_rule_usages`, `exchange_rates`, `failed_jobs`, `innovations`, `inventory_vault`, `item_amenity`, `item_features`, `item_related`, `job_applications`, `model_has_permissions`, `packaging`, `partners`, `personal_access_tokens`, `post_tags`, `product_analytics`, `project_categories`, `project_images`, `project_technology`, `projects`, `provider_invitations`, `rank_bonuses`, `ranks`, `related_group_items`, `room_availability`, `sectors`, `seller_invitations`, `service_categories`, `service_clicks`, `service_features`, `service_images`, `service_specifications`, `service_sub_categories`, `services`, `sessions`, `technologies`, `temporaly_images`, `user_milestones`, `whistleblowings`, `withdrawals`
