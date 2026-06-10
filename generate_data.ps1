# Parse TOEFL 3800 vocabulary text files into data.js
$desktop = [Environment]::GetFolderPath('Desktop')
$sourceDir = Join-Path $desktop "New folder\TOEFL 3800"
$outputDir = Join-Path $desktop "TOEFL3800_VocabApp"
$outputFile = Join-Path $outputDir "data.js"

# Ensure output dir exists
if (!(Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force }

$rankNames = @{
    "Rank1" = "Rank 1"
    "Rank2" = "Rank 2"
    "Rank3" = "Rank 3"
    "Rank4" = "Rank 4"
}

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("const VOCAB_DATA = {")

foreach ($rankFile in @("Rank1.txt", "Rank2.txt", "Rank3.txt", "Rank4.txt")) {
    $rankKey = $rankFile -replace '\.txt$', ''
    $rankLabel = $rankNames[$rankKey]
    $filePath = Join-Path $sourceDir $rankFile
    
    Write-Host "Processing $filePath ..."
    $lines = [System.IO.File]::ReadAllLines($filePath, [System.Text.Encoding]::UTF8)

    [void]$sb.AppendLine("  `"$rankLabel`": {")
    $currentSection = $null
    $sectionWords = [System.Collections.ArrayList]::new()
    $inSection = $false

    foreach ($line in $lines) {
        $line = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        
        if ($line -match "^${rankKey}-(\d+)$") {
            # Save previous section
            if ($inSection -and $sectionWords.Count -gt 0) {
                [void]$sb.AppendLine("    `"$currentSection`": [")
                foreach ($w in $sectionWords) {
                    [void]$sb.AppendLine("      $w,")
                }
                [void]$sb.AppendLine("    ],")
            }
            $sectionNum = $Matches[1]
            $currentSection = "Section $sectionNum"
            $sectionWords.Clear()
            $inSection = $true
        }
        elseif ($inSection -and $line.Contains(',')) {
            $commaIdx = $line.IndexOf(',')
            $word = $line.Substring(0, $commaIdx).Trim()
            $meaning = $line.Substring($commaIdx + 1).Trim()
            $word = $word -replace '\\', '\\\\' -replace '"', '\"'
            $meaning = $meaning -replace '\\', '\\\\' -replace '"', '\"'
            [void]$sectionWords.Add("{w:`"$word`",m:`"$meaning`"}")
        }
    }
    # Save last section
    if ($inSection -and $sectionWords.Count -gt 0) {
        [void]$sb.AppendLine("    `"$currentSection`": [")
        foreach ($w in $sectionWords) {
            [void]$sb.AppendLine("      $w,")
        }
        [void]$sb.AppendLine("    ],")
    }
    [void]$sb.AppendLine("  },")
}

[void]$sb.AppendLine("};")

[System.IO.File]::WriteAllText($outputFile, $sb.ToString(), [System.Text.Encoding]::UTF8)
Write-Host "Generated data.js at $outputFile"
Write-Host "File size: $((Get-Item $outputFile).Length) bytes"
