' @example: diagnostics/spread-non-persistent/trigger
' @demonstrates: spread em New T() With { ...other, ... } mas T não tem Assign
' @diagnostics: spread-non-persistent@5
' @requires: classe TPoint sem TPersistent na cadeia
'
Namespace mod_demo
   Sub Run(pOutro As TPoint)
      Dim p As TPoint = New TPoint() With { ...pOutro, .X = 10 }
   End Sub
End Namespace
