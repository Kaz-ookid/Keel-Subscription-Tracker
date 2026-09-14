// Static image imports resolve to a Metro asset id (a number the Image
// component accepts as `source`).
declare module "*.png" {
  const asset: number;
  export default asset;
}
