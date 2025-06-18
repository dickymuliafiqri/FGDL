import { sleep } from "bun";
import { readdir, rm, exists } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer";
import prettyBytes from "pretty-bytes";

const fgPasteLink = Bun.argv[2] as string;

const downloadDir = join(homedir(), "Downloads");
const elementsSelector = {
  links: "#plaintext > ul:nth-child(2)",
  filename: ".text-xl",
};

// Launch the browser and open a new blank page
const browser = await puppeteer.launch({
  headless: false,
});

const page = await browser.newPage();

// Set screen size.
await page.setViewport({ width: 1080, height: 1024 });

// Navigate the page to a URL.
await page.goto(fgPasteLink);

// Select links
await page.waitForSelector(elementsSelector.links);

let links = (await page.$eval(elementsSelector.links, (el) => el.innerText)).split("\n");

// Intercepts popup page
browser.on("targetcreated", async (target) => {
  if (target.type() == "page") {
    const page = await target.page();
    await page?.close();
  }
});

// Visit each link
try {
  console.log("Delete unfinished downloads...");
  checkDownloads(true);

  for (const link of links) {
    console.log(`Downloading: ${link}...`);
    await page.goto(link);
    await page.waitForSelector(elementsSelector.filename);
    const filename = await page.$eval(elementsSelector.filename, (el) => el.innerText);

    if (await exists(join(downloadDir, filename))) {
      console.log(`File exists: ${filename}...`);
      continue;
    }

    while (await checkDownloads()) {
      console.log("Trying to download...");

      const dlButton = await page.waitForSelector(".link-button", {
        timeout: 1000,
      });
      await dlButton?.click();

      await sleep(2000);
    }

    while (!(await checkDownloads())) {
      await sleep(1000);
    }
  }
} catch (e) {
  console.error(e);
} finally {
  console.log("Closing browser in 10s...");
  await sleep(10000);
  await browser.close();
}

async function checkDownloads(deleteUnfinished = false) {
  const fileList = await readdir(downloadDir);
  for (const file of fileList) {
    if (file.endsWith("download")) {
      if (deleteUnfinished) {
        await rm(join(downloadDir, file));
      } else {
        const dlFile = Bun.file(join(downloadDir, file));
        console.log(`Downloading ${file}: ${prettyBytes(dlFile.size)}...`);
        return false;
      }
    }
  }

  return true;
}
