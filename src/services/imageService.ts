import { supabase } from "./supabaseClient";

/**
 * Image Service
 * Handles image uploads to Supabase Storage
 * Uses the 'product-images' bucket for parts and the 'shop-photos' bucket
 * for shop gallery photos.
 */

const BUCKET_NAME = "product-images";
const SHOP_BUCKET_NAME = "shop-photos";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Validate a file before it hits storage. Returns an error message or null.
export const validateImageFile = (file: File): string | null => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Only JPEG, PNG, WEBP or GIF images are allowed.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
};

const sanitizeName = (name: string) =>
  name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");

export const imageService = {
  /**
   * Upload an image to Supabase Storage
   * Stores in the 'product-images' bucket
   */
  async uploadPartImage(file: File, partName: string): Promise<string | null> {
    try {
      // Generate unique filename
      const timestamp = Date.now();
      const filename = `${sanitizeName(partName)}_${timestamp}_${file.name}`;
      const filePath = `parts/${filename}`;

      // Upload to Supabase Storage
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        console.error("Upload error details:", error);
        throw error;
      }

      // Get public URL
      const { data: publicData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      console.log(
        "✅ Image uploaded to product-images bucket:",
        publicData.publicUrl,
      );
      return publicData.publicUrl;
    } catch (err) {
      console.error("Error uploading image:", err);
      return null;
    }
  },

  /**
   * Upload a shop gallery photo to the 'shop-photos' bucket.
   * Validates file type and size before uploading.
   */
  async uploadShopPhoto(file: File, shopName: string): Promise<string | null> {
    try {
      const validationError = validateImageFile(file);
      if (validationError) {
        console.error("Validation error:", validationError);
        return null;
      }

      const timestamp = Date.now();
      const filename = `${sanitizeName(shopName)}_${timestamp}_${file.name}`;
      const filePath = `shops/${filename}`;

      const { error } = await supabase.storage
        .from(SHOP_BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        console.error("Upload error details:", error);
        throw error;
      }

      const { data: publicData } = supabase.storage
        .from(SHOP_BUCKET_NAME)
        .getPublicUrl(filePath);

      console.log("✅ Shop photo uploaded:", publicData.publicUrl);
      return publicData.publicUrl;
    } catch (err) {
      console.error("Error uploading shop photo:", err);
      return null;
    }
  },

  /**
   * Delete a shop gallery photo from the 'shop-photos' bucket.
   */
  async deleteShopPhoto(imageUrl: string): Promise<boolean> {
    try {
      const bucketMarker = `${SHOP_BUCKET_NAME}/`;
      const bucketIndex = imageUrl.indexOf(bucketMarker);

      let filePath: string;
      if (bucketIndex !== -1) {
        filePath = imageUrl.substring(bucketIndex + bucketMarker.length);
      } else {
        const urlParts = imageUrl.split("/").pop();
        if (!urlParts) throw new Error("Invalid image URL");
        filePath = `shops/${urlParts}`;
      }

      const { error } = await supabase.storage
        .from(SHOP_BUCKET_NAME)
        .remove([filePath]);

      if (error) {
        throw error;
      }

      console.log("✅ Shop photo deleted");
      return true;
    } catch (err) {
      console.error("Error deleting shop photo:", err);
      return false;
    }
  },

  /**
   * Delete an image from Supabase Storage
   */
  async deletePartImage(imageUrl: string): Promise<boolean> {
    try {
      // Extract the path after the bucket name from the URL
      // URL format: .../storage/v1/object/public/product-images/parts/filename.jpg
      const bucketMarker = `${BUCKET_NAME}/`;
      const bucketIndex = imageUrl.indexOf(bucketMarker);

      let filePath: string;
      if (bucketIndex !== -1) {
        filePath = imageUrl.substring(bucketIndex + bucketMarker.length);
      } else {
        // Fallback: extract just the filename
        const urlParts = imageUrl.split("/").pop();
        if (!urlParts) throw new Error("Invalid image URL");
        filePath = `parts/${urlParts}`;
      }

      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([filePath]);

      if (error) {
        throw error;
      }

      console.log("✅ Image deleted from product-images bucket");
      return true;
    } catch (err) {
      console.error("Error deleting image:", err);
      return false;
    }
  },
};
