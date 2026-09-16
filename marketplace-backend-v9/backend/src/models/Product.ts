import { Schema, model, Types, type HydratedDocument, type Model } from 'mongoose';
import { UNITS, type Unit } from '../constants';
import { slugify } from '../utils/slugify';

export interface IProductImage {
  url: string;
  publicId: string;
}

export interface IProduct {
  seller: Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  price: number;
  discountPrice?: number;
  stock: number;
  unit: Unit;
  category: string;
  images: IProductImage[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ProductDocument = HydratedDocument<IProduct>;

const imageSchema = new Schema<IProductImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false },
);

const productSchema = new Schema<IProduct>(
  {
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    price: { type: Number, required: true, min: 0 },
    discountPrice: {
      type: Number,
      min: 0,
      validate: {
        validator(this: IProduct, value?: number) {
          return value == null || value < this.price;
        },
        message: 'discountPrice must be lower than price',
      },
    },
    // `min` guards document saves. Atomic $inc paths are guarded in stock.service via a
    // conditional filter ({ stock: { $gte: qty } }) so stock can never go negative.
    stock: { type: Number, required: true, default: 0, min: [0, 'Stock cannot be negative'] },
    unit: { type: String, enum: UNITS, required: true },
    category: { type: String, required: true, trim: true, lowercase: true, maxlength: 60 },
    images: { type: [imageSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true },
  },
);

productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ seller: 1, createdAt: -1 });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ isActive: 1, price: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ title: 1 });

productSchema.virtual('effectivePrice').get(function (this: IProduct) {
  return this.discountPrice != null && this.discountPrice < this.price ? this.discountPrice : this.price;
});

productSchema.virtual('inStock').get(function (this: IProduct) {
  return this.stock > 0;
});

/** Generate a unique slug from the title on create or when the title changes. */
productSchema.pre('validate', async function () {
  if (this.slug && !this.isModified('title')) return;
  const base = slugify(this.title) || 'product';
  const ProductModel = this.constructor as Model<IProduct>;
  let candidate = base;
  let suffix = 1;
  while (await ProductModel.exists({ slug: candidate, _id: { $ne: this._id } })) {
    candidate = `${base}-${suffix++}`;
  }
  this.slug = candidate;
});

export const Product = model<IProduct>('Product', productSchema);
