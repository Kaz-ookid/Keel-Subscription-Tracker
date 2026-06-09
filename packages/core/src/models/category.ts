export interface Category {
  id: string;
  name: string;
  /** Icon token the platform maps to its own icon set (categories have an icon,
   *  not a colour). */
  icon?: string;
  parentCategoryId?: string;
}
