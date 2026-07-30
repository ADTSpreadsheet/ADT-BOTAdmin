"use strict";

const crypto = require("crypto");

/*
  ============================================================
  ADT-PILEFiX PROFESSIONAL RELEASE SERVICE
  File: services/professionalReleaseService.js

  Supabase table:
    public.professional_releases

  Supabase Storage:
    Bucket: adt-software
    Root folder: professional/
  ============================================================
*/

const RELEASE_TABLE = "professional_releases";
const STORAGE_BUCKET = "adt-software";
const STORAGE_ROOT = "professional";

const STATUS_DRAFT = "DRAFT";
const STATUS_PUBLISHED = "PUBLISHED";
const STATUS_ARCHIVED = "ARCHIVED";

const ALLOWED_STATUS = new Set([
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_ARCHIVED
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const XLSM_MIME_TYPE =
  "application/vnd.ms-excel.sheet.macroEnabled.12";


/*
  ============================================================
  GENERIC HELPERS
  ============================================================
*/

function createHttpError(
  message,
  statusCode = 500,
  code = "INTERNAL_ERROR"
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}


function cleanText(value, maxLength = null) {
  const text = String(value ?? "").trim();

  if (
    Number.isInteger(maxLength) &&
    maxLength > 0 &&
    text.length > maxLength
  ) {
    return text.slice(0, maxLength);
  }

  return text;
}


function parsePositiveInteger(value, fieldName) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    throw createHttpError(
      `${fieldName} must be a positive integer.`,
      400,
      "INVALID_VERSION_CODE"
    );
  }

  return number;
}


function parseBoolean(value, defaultValue = false) {
  if (
    value === true ||
    value === "true" ||
    value === "1" ||
    value === 1
  ) {
    return true;
  }

  if (
    value === false ||
    value === "false" ||
    value === "0" ||
    value === 0
  ) {
    return false;
  }

  return defaultValue;
}


function normalizeStatus(
  value,
  defaultStatus = STATUS_DRAFT
) {
  const status =
    cleanText(value || defaultStatus)
      .toUpperCase();

  if (!ALLOWED_STATUS.has(status)) {
    throw createHttpError(
      "status must be DRAFT, PUBLISHED or ARCHIVED.",
      400,
      "INVALID_RELEASE_STATUS"
    );
  }

  return status;
}


function normalizeReleaseDate(value) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw createHttpError(
      "release_date must use YYYY-MM-DD format.",
      400,
      "INVALID_RELEASE_DATE"
    );
  }

  const date = new Date(`${text}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text
  ) {
    throw createHttpError(
      "release_date is not a valid calendar date.",
      400,
      "INVALID_RELEASE_DATE"
    );
  }

  return text;
}


function sanitizeFileName(fileName) {
  const original =
    cleanText(fileName) ||
    "ADT-PILEFiX-Professional.xlsm";

  const baseName =
    original
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[<>:"|?*]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^\.+/, "")
      .slice(0, 180);

  if (!baseName) {
    return "ADT-PILEFiX-Professional.xlsm";
  }

  if (!baseName.toLowerCase().endsWith(".xlsm")) {
    return `${baseName}.xlsm`;
  }

  return baseName;
}


function buildStoragePath(
  versionCode,
  fileName
) {
  return (
    `${STORAGE_ROOT}/` +
    `${versionCode}/` +
    `${sanitizeFileName(fileName)}`
  );
}


function calculateSha256(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}


function normalizeFileMimeType(mimeType) {
  const value = cleanText(mimeType);

  if (!value) {
    return XLSM_MIME_TYPE;
  }

  return value;
}


function validateProgramFile(file) {
  if (!file) {
    throw createHttpError(
      "program_file is required.",
      400,
      "PROGRAM_FILE_REQUIRED"
    );
  }

  if (!Buffer.isBuffer(file.buffer)) {
    throw createHttpError(
      "Uploaded program file is invalid.",
      400,
      "INVALID_PROGRAM_FILE"
    );
  }

  if (
    !Number.isFinite(file.size) ||
    file.size <= 0
  ) {
    throw createHttpError(
      "Uploaded program file is empty.",
      400,
      "EMPTY_PROGRAM_FILE"
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw createHttpError(
      "Program file exceeds the 50 MB limit.",
      413,
      "PROGRAM_FILE_TOO_LARGE"
    );
  }

  const originalName =
    cleanText(file.originalname);

  if (
    !originalName ||
    !originalName
      .toLowerCase()
      .endsWith(".xlsm")
  ) {
    throw createHttpError(
      "Only .xlsm files are allowed.",
      400,
      "INVALID_FILE_EXTENSION"
    );
  }

  return {
    buffer: file.buffer,
    size: file.size,
    originalName,
    safeFileName:
      sanitizeFileName(originalName),
    mimeType:
      normalizeFileMimeType(file.mimetype)
  };
}


function normalizeReleaseInput(
  input = {},
  options = {}
) {
  const {
    forceStatus = null,
    requirePublishedFile = false
  } = options;

  const versionName =
    cleanText(input.version_name, 120);

  const versionCode =
    parsePositiveInteger(
      input.version_code,
      "version_code"
    );

  const releaseTitle =
    cleanText(input.release_title, 240);

  const releaseDate =
    normalizeReleaseDate(
      input.release_date
    );

  const developerMessage =
    cleanText(
      input.developer_message,
      4000
    );

  const releaseNotes =
    cleanText(
      input.release_notes,
      8000
    );

  const status =
    forceStatus
      ? normalizeStatus(forceStatus)
      : normalizeStatus(input.status);

  const isForceUpdate =
    parseBoolean(
      input.is_force_update,
      false
    );

  const downloadAvailable =
    parseBoolean(
      input.download_available,
      true
    );

  if (!versionName) {
    throw createHttpError(
      "version_name is required.",
      400,
      "VERSION_NAME_REQUIRED"
    );
  }

  if (!releaseTitle) {
    throw createHttpError(
      "release_title is required.",
      400,
      "RELEASE_TITLE_REQUIRED"
    );
  }

  if (
    requirePublishedFile &&
    status !== STATUS_PUBLISHED
  ) {
    throw createHttpError(
      "Uploaded release must use PUBLISHED status.",
      400,
      "INVALID_UPLOAD_STATUS"
    );
  }

  return {
    version_name: versionName,
    version_code: versionCode,
    release_title: releaseTitle,
    release_date: releaseDate,
    developer_message: developerMessage || null,
    release_notes: releaseNotes || null,
    status,
    is_force_update: isForceUpdate,
    download_available: downloadAvailable
  };
}


function mapSupabaseError(error) {
  if (!error) {
    return createHttpError(
      "Unknown Supabase error.",
      500,
      "SUPABASE_ERROR"
    );
  }

  if (error.code === "23505") {
    return createHttpError(
      "This version_code already exists.",
      409,
      "VERSION_CODE_ALREADY_EXISTS"
    );
  }

  if (error.code === "23514") {
    return createHttpError(
      error.message ||
      "Release data violates a database rule.",
      400,
      "DATABASE_CONSTRAINT_ERROR"
    );
  }

  return createHttpError(
    error.message ||
    "Supabase operation failed.",
    500,
    error.code || "SUPABASE_ERROR"
  );
}


/*
  ============================================================
  SERVICE FACTORY
  ============================================================
*/

function createProfessionalReleaseService({
  supabase
} = {}) {
  if (!supabase) {
    throw new Error(
      "ProfessionalReleaseService requires supabase."
    );
  }


  /*
    ----------------------------------------------------------
    GET LATEST RELEASE

    latest=true:
      Return the active published release first.
      If no active release exists, return the highest version.
    ----------------------------------------------------------
  */

  async function getLatestRelease() {
    const {
      data: activeRelease,
      error: activeError
    } = await supabase
      .from(RELEASE_TABLE)
      .select("*")
      .eq("is_active", true)
      .eq("status", STATUS_PUBLISHED)
      .maybeSingle();

    if (activeError) {
      throw mapSupabaseError(activeError);
    }

    if (activeRelease) {
      return {
        data: activeRelease,
        updated_at:
          activeRelease.updated_at ||
          activeRelease.created_at ||
          null
      };
    }

    const {
      data: fallbackRows,
      error: fallbackError
    } = await supabase
      .from(RELEASE_TABLE)
      .select("*")
      .order("version_code", {
        ascending: false
      })
      .order("created_at", {
        ascending: false
      })
      .limit(1);

    if (fallbackError) {
      throw mapSupabaseError(fallbackError);
    }

    const fallbackRelease =
      Array.isArray(fallbackRows) &&
      fallbackRows.length > 0
        ? fallbackRows[0]
        : null;

    return {
      data: fallbackRelease,
      updated_at:
        fallbackRelease?.updated_at ||
        fallbackRelease?.created_at ||
        null
    };
  }


  /*
    ----------------------------------------------------------
    GET RELEASES
    ----------------------------------------------------------
  */

  async function getReleases({
    limit = 50,
    status = null
  } = {}) {
    const safeLimit =
      Math.min(
        Math.max(
          Number(limit) || 50,
          1
        ),
        100
      );

    let query = supabase
      .from(RELEASE_TABLE)
      .select("*")
      .order("version_code", {
        ascending: false
      })
      .order("created_at", {
        ascending: false
      })
      .limit(safeLimit);

    if (status) {
      query = query.eq(
        "status",
        normalizeStatus(status)
      );
    }

    const {
      data,
      error
    } = await query;

    if (error) {
      throw mapSupabaseError(error);
    }

    return {
      data: data || [],
      count:
        Array.isArray(data)
          ? data.length
          : 0,
      updated_at: new Date().toISOString()
    };
  }


  /*
    ----------------------------------------------------------
    SAVE DRAFT

    Upsert by version_code.
    A draft does not require a program file.
    ----------------------------------------------------------
  */

  async function saveReleaseDraft(input = {}) {
    const release =
      normalizeReleaseInput(
        input,
        {
          forceStatus: STATUS_DRAFT
        }
      );

    const payload = {
      ...release,
      status: STATUS_DRAFT,
      is_active: false,
      published_at: null
    };

    const {
      data,
      error
    } = await supabase
      .from(RELEASE_TABLE)
      .upsert(
        payload,
        {
          onConflict: "version_code"
        }
      )
      .select("*")
      .single();

    if (error) {
      throw mapSupabaseError(error);
    }

    return {
      data,
      updated_at:
        data.updated_at ||
        new Date().toISOString()
    };
  }


  /*
    ----------------------------------------------------------
    INTERNAL: READ RELEASE BY VERSION CODE
    ----------------------------------------------------------
  */

  async function findReleaseByVersionCode(
    versionCode
  ) {
    const {
      data,
      error
    } = await supabase
      .from(RELEASE_TABLE)
      .select("*")
      .eq(
        "version_code",
        versionCode
      )
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data || null;
  }


  /*
    ----------------------------------------------------------
    INTERNAL: RESTORE PREVIOUS ACTIVE RELEASE

    Used only if publishing the new release fails after the
    previous active version has already been disabled.
    ----------------------------------------------------------
  */

  async function restorePreviousActiveRelease(
    previousActiveRelease
  ) {
    if (!previousActiveRelease?.id) {
      return;
    }

    const {
      error
    } = await supabase
      .from(RELEASE_TABLE)
      .update({
        status: STATUS_PUBLISHED,
        is_active: true,
        published_at:
          previousActiveRelease.published_at ||
          new Date().toISOString()
      })
      .eq(
        "id",
        previousActiveRelease.id
      );

    if (error) {
      console.error(
        "[Professional Release] " +
        "Cannot restore previous active release:",
        error
      );
    }
  }


  /*
    ----------------------------------------------------------
    UPLOAD AND PUBLISH RELEASE

    1. Validate .xlsm file
    2. Upload to Storage
    3. Disable previous active release
    4. Upsert published release
    5. Roll back Storage / active release if needed
    ----------------------------------------------------------
  */

  async function uploadAndPublishRelease(
    input = {},
    file
  ) {
    const release =
      normalizeReleaseInput(
        input,
        {
          forceStatus:
            STATUS_PUBLISHED,
          requirePublishedFile: true
        }
      );

    const validatedFile =
      validateProgramFile(file);

    const storagePath =
      buildStoragePath(
        release.version_code,
        validatedFile.safeFileName
      );

    const fileSha256 =
      calculateSha256(
        validatedFile.buffer
      );

    const existingRelease =
      await findReleaseByVersionCode(
        release.version_code
      );

    const {
      data: previousActiveRelease,
      error: previousActiveError
    } = await supabase
      .from(RELEASE_TABLE)
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    if (previousActiveError) {
      throw mapSupabaseError(
        previousActiveError
      );
    }

    const oldStoragePath =
      existingRelease?.storage_path || null;

    let fileUploaded = false;
    let previousActiveDisabled = false;

    try {
      /*
        Upload file first.

        upsert=true allows replacing a file when the same
        version_code and filename are uploaded again.
      */

      const {
        error: uploadError
      } = await supabase
        .storage
        .from(STORAGE_BUCKET)
        .upload(
          storagePath,
          validatedFile.buffer,
          {
            contentType:
              validatedFile.mimeType,
            cacheControl: "3600",
            upsert: true
          }
        );

      if (uploadError) {
        throw mapSupabaseError(
          uploadError
        );
      }

      fileUploaded = true;

      /*
        Disable the currently active release before setting
        the new version active.

        The database has a unique partial index that allows
        only one row with is_active=true.
      */

      const {
        error: deactivateError
      } = await supabase
        .from(RELEASE_TABLE)
        .update({
          is_active: false
        })
        .eq("is_active", true);

      if (deactivateError) {
        throw mapSupabaseError(
          deactivateError
        );
      }

      previousActiveDisabled =
        Boolean(previousActiveRelease);

      const publishedAt =
        new Date().toISOString();

      const payload = {
        ...release,

        storage_bucket:
          STORAGE_BUCKET,

        storage_path:
          storagePath,

        file_name:
          validatedFile.safeFileName,

        file_size:
          validatedFile.size,

        file_mime_type:
          validatedFile.mimeType,

        file_sha256:
          fileSha256,

        status:
          STATUS_PUBLISHED,

        is_active:
          true,

        published_at:
          publishedAt
      };

      const {
        data,
        error: saveError
      } = await supabase
        .from(RELEASE_TABLE)
        .upsert(
          payload,
          {
            onConflict:
              "version_code"
          }
        )
        .select("*")
        .single();

      if (saveError) {
        throw mapSupabaseError(
          saveError
        );
      }

      /*
        If the version was republished under a different file
        name, remove the older file after the database update
        succeeds.
      */

      if (
        oldStoragePath &&
        oldStoragePath !== storagePath
      ) {
        const {
          error: removeOldError
        } = await supabase
          .storage
          .from(STORAGE_BUCKET)
          .remove([
            oldStoragePath
          ]);

        if (removeOldError) {
          console.warn(
            "[Professional Release] " +
            "Cannot remove old Storage file:",
            removeOldError
          );
        }
      }

      return {
        data,
        updated_at:
          data.updated_at ||
          publishedAt
      };

    } catch (error) {
      /*
        Remove the newly uploaded file only when it did not
        replace the same path of an existing release.
      */

      if (
        fileUploaded &&
        storagePath !== oldStoragePath
      ) {
        const {
          error: removeError
        } = await supabase
          .storage
          .from(STORAGE_BUCKET)
          .remove([
            storagePath
          ]);

        if (removeError) {
          console.error(
            "[Professional Release] " +
            "Cannot remove failed upload:",
            removeError
          );
        }
      }

      if (previousActiveDisabled) {
        await restorePreviousActiveRelease(
          previousActiveRelease
        );
      }

      throw error;
    }
  }


  /*
    ----------------------------------------------------------
    ARCHIVE RELEASE
    ----------------------------------------------------------
  */

  async function archiveRelease(
    versionCodeValue
  ) {
    const versionCode =
      parsePositiveInteger(
        versionCodeValue,
        "version_code"
      );

    const existing =
      await findReleaseByVersionCode(
        versionCode
      );

    if (!existing) {
      throw createHttpError(
        "Release not found.",
        404,
        "RELEASE_NOT_FOUND"
      );
    }

    const {
      data,
      error
    } = await supabase
      .from(RELEASE_TABLE)
      .update({
        status: STATUS_ARCHIVED,
        is_active: false
      })
      .eq(
        "version_code",
        versionCode
      )
      .select("*")
      .single();

    if (error) {
      throw mapSupabaseError(error);
    }

    return {
      data,
      updated_at:
        data.updated_at ||
        new Date().toISOString()
    };
  }


  return {
    getLatestRelease,
    getReleases,
    saveReleaseDraft,
    uploadAndPublishRelease,
    archiveRelease
  };
}

module.exports = {
  createProfessionalReleaseService,

  RELEASE_TABLE,
  STORAGE_BUCKET,
  STORAGE_ROOT,

  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_ARCHIVED,

  MAX_FILE_SIZE_BYTES,
  XLSM_MIME_TYPE
};
