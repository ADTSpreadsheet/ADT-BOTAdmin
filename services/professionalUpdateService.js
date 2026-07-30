"use strict";

/*
  ============================================================
  ADT-PILEFiX PROFESSIONAL PUBLIC UPDATE SERVICE
  File: services/professionalUpdateService.js

  Public endpoints use this service to:
    1. Return the latest active Professional release
    2. Verify a Professional user's download right
    3. Create a short-lived Supabase Storage signed URL

  IMPORTANT:
  The account table/column constants below must match the
  existing Professional login system.
  ============================================================
*/

const RELEASE_TABLE = "professional_releases";
const ACCOUNT_TABLE = "professional_accounts";

const STORAGE_BUCKET = "adt-software";
const STATUS_PUBLISHED = "PUBLISHED";
const SIGNED_URL_EXPIRES_SECONDS = 300;

/*
  Existing Professional account schema expected by this file:

    professional_accounts.booking_no
    professional_accounts.machine_id
    professional_accounts.status

  Allowed account statuses:
    ACTIVE
    ACTIVATED
    PAID

  If the existing login system uses different column names,
  change only the constants below.
*/

const ACCOUNT_BOOKING_COLUMN = "booking_no";
const ACCOUNT_MACHINE_COLUMN = "machine_id";
const ACCOUNT_STATUS_COLUMN = "status";

const ALLOWED_ACCOUNT_STATUS = new Set([
  "ACTIVE",
  "ACTIVATED",
  "PAID"
]);


/*
  ============================================================
  HELPERS
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


function normalizeBookingNo(value) {
  const bookingNo =
    cleanText(value, 80).toUpperCase();

  if (!bookingNo) {
    throw createHttpError(
      "booking_no is required.",
      400,
      "BOOKING_NO_REQUIRED"
    );
  }

  return bookingNo;
}


function normalizeMachineId(value) {
  const machineId =
    cleanText(value, 240).toUpperCase();

  if (!machineId) {
    throw createHttpError(
      "machine_id is required.",
      400,
      "MACHINE_ID_REQUIRED"
    );
  }

  return machineId;
}


function normalizeVersionCode(
  value,
  {
    required = false
  } = {}
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    if (required) {
      throw createHttpError(
        "version_code is required.",
        400,
        "VERSION_CODE_REQUIRED"
      );
    }

    return null;
  }

  const versionCode = Number(value);

  if (
    !Number.isInteger(versionCode) ||
    versionCode <= 0
  ) {
    throw createHttpError(
      "version_code must be a positive integer.",
      400,
      "INVALID_VERSION_CODE"
    );
  }

  return versionCode;
}


function normalizeAccountStatus(value) {
  return cleanText(value).toUpperCase();
}


function mapSupabaseError(error) {
  if (!error) {
    return createHttpError(
      "Unknown Supabase error.",
      500,
      "SUPABASE_ERROR"
    );
  }

  return createHttpError(
    error.message ||
    "Supabase operation failed.",
    500,
    error.code || "SUPABASE_ERROR"
  );
}


function buildPublicReleaseData(release) {
  if (!release) {
    return null;
  }

  return {
    version_name:
      release.version_name,

    version_code:
      release.version_code,

    release_title:
      release.release_title,

    release_date:
      release.release_date,

    developer_message:
      release.developer_message,

    release_notes:
      release.release_notes,

    is_force_update:
      Boolean(release.is_force_update),

    download_available:
      Boolean(release.download_available),

    published_at:
      release.published_at
  };
}


/*
  ============================================================
  SERVICE FACTORY
  ============================================================
*/

function createProfessionalUpdateService({
  supabase
} = {}) {
  if (!supabase) {
    throw new Error(
      "ProfessionalUpdateService requires supabase."
    );
  }


  /*
    ----------------------------------------------------------
    INTERNAL: GET ACTIVE PUBLISHED RELEASE
    ----------------------------------------------------------
  */

  async function findLatestActiveRelease() {
    const {
      data,
      error
    } = await supabase
      .from(RELEASE_TABLE)
      .select(
        [
          "id",
          "version_name",
          "version_code",
          "release_title",
          "release_date",
          "developer_message",
          "release_notes",
          "storage_bucket",
          "storage_path",
          "file_name",
          "file_size",
          "file_mime_type",
          "file_sha256",
          "status",
          "is_active",
          "is_force_update",
          "download_available",
          "published_at"
        ].join(",")
      )
      .eq("status", STATUS_PUBLISHED)
      .eq("is_active", true)
      .order("version_code", {
        ascending: false
      })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    return data || null;
  }


  /*
    ----------------------------------------------------------
    GET LATEST UPDATE INFORMATION

    This response intentionally excludes:
      storage_bucket
      storage_path
      file_sha256
    ----------------------------------------------------------
  */

  async function getLatestUpdate() {
    const release =
      await findLatestActiveRelease();

    return {
      data:
        buildPublicReleaseData(
          release
        ),

      updated_at:
        release?.published_at ||
        null
    };
  }


  /*
    ----------------------------------------------------------
    VERIFY PROFESSIONAL ACCOUNT

    This function uses the existing Professional account table.

    If the current login system uses a different schema,
    update the constants at the top of this file.
    ----------------------------------------------------------
  */

  async function verifyProfessionalAccess({
    bookingNo,
    machineId
  }) {
    const selectColumns = [
      "id",
      ACCOUNT_BOOKING_COLUMN,
      ACCOUNT_MACHINE_COLUMN,
      ACCOUNT_STATUS_COLUMN
    ].join(",");

    const {
      data: account,
      error
    } = await supabase
      .from(ACCOUNT_TABLE)
      .select(selectColumns)
      .eq(
        ACCOUNT_BOOKING_COLUMN,
        bookingNo
      )
      .maybeSingle();

    if (error) {
      throw mapSupabaseError(error);
    }

    if (!account) {
      throw createHttpError(
        "Professional account not found.",
        404,
        "PROFESSIONAL_ACCOUNT_NOT_FOUND"
      );
    }

    const storedMachineId =
      normalizeMachineId(
        account[
          ACCOUNT_MACHINE_COLUMN
        ]
      );

    if (storedMachineId !== machineId) {
      throw createHttpError(
        "This license is registered to another computer.",
        403,
        "MACHINE_MISMATCH"
      );
    }

    const accountStatus =
      normalizeAccountStatus(
        account[
          ACCOUNT_STATUS_COLUMN
        ]
      );

    if (
      !ALLOWED_ACCOUNT_STATUS.has(
        accountStatus
      )
    ) {
      throw createHttpError(
        "Professional account is not active.",
        403,
        "PROFESSIONAL_ACCOUNT_NOT_ACTIVE"
      );
    }

    return account;
  }


  /*
    ----------------------------------------------------------
    CREATE DOWNLOAD SIGNED URL

    Excel sends:
      booking_no
      machine_id
      version_code

    version_code should be the version that Excel wants to
    download. It must match the active published release.
    ----------------------------------------------------------
  */

  async function createDownloadLink(
    input = {}
  ) {
    const bookingNo =
      normalizeBookingNo(
        input.booking_no
      );

    const machineId =
      normalizeMachineId(
        input.machine_id
      );

    const requestedVersionCode =
      normalizeVersionCode(
        input.version_code,
        {
          required: true
        }
      );

    await verifyProfessionalAccess({
      bookingNo,
      machineId
    });

    const release =
      await findLatestActiveRelease();

    if (!release) {
      throw createHttpError(
        "No active Professional release is available.",
        404,
        "ACTIVE_RELEASE_NOT_FOUND"
      );
    }

    if (
      Number(release.version_code) !==
      requestedVersionCode
    ) {
      throw createHttpError(
        "The requested version is no longer the active release.",
        409,
        "RELEASE_VERSION_CHANGED"
      );
    }

    if (!release.download_available) {
      throw createHttpError(
        "Download is not available for this release.",
        403,
        "DOWNLOAD_NOT_AVAILABLE"
      );
    }

    const storageBucket =
      cleanText(
        release.storage_bucket
      ) || STORAGE_BUCKET;

    const storagePath =
      cleanText(
        release.storage_path
      );

    if (!storagePath) {
      throw createHttpError(
        "Release file path is missing.",
        500,
        "RELEASE_STORAGE_PATH_MISSING"
      );
    }

    const {
      data: signedData,
      error: signedError
    } = await supabase
      .storage
      .from(storageBucket)
      .createSignedUrl(
        storagePath,
        SIGNED_URL_EXPIRES_SECONDS,
        {
          download:
            release.file_name ||
            undefined
        }
      );

    if (signedError) {
      throw mapSupabaseError(
        signedError
      );
    }

    const signedUrl =
      signedData?.signedUrl ||
      signedData?.signedURL ||
      null;

    if (!signedUrl) {
      throw createHttpError(
        "Cannot create signed download URL.",
        500,
        "SIGNED_URL_NOT_CREATED"
      );
    }

    return {
      data: {
        version_name:
          release.version_name,

        version_code:
          release.version_code,

        file_name:
          release.file_name,

        file_size:
          release.file_size,

        file_mime_type:
          release.file_mime_type,

        file_sha256:
          release.file_sha256,

        download_url:
          signedUrl,

        expires_in:
          SIGNED_URL_EXPIRES_SECONDS
      },

      updated_at:
        new Date().toISOString()
    };
  }


  return {
    getLatestUpdate,
    createDownloadLink
  };
}


module.exports = {
  createProfessionalUpdateService,

  RELEASE_TABLE,
  ACCOUNT_TABLE,
  STORAGE_BUCKET,

  STATUS_PUBLISHED,
  SIGNED_URL_EXPIRES_SECONDS,

  ACCOUNT_BOOKING_COLUMN,
  ACCOUNT_MACHINE_COLUMN,
  ACCOUNT_STATUS_COLUMN
};
