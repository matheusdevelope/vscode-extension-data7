' @example: diagnostics/flat-name-collision/trigger
' @demonstrates: source type carries `_` so two distinct usages collapse to the same flat name
' @diagnostics: flat-name-collision@14
' @requires: emitted by the SugarTranspiler at build-time (Fase 6); the live linter does not yet track flat-name collisions.
'
Namespace mod_demo

   ' A user-defined type whose name already contains `_` confuses the
   ' canonical flat-name scheme. Two distinct usages Box<A_B> and Box<A,B>
   ' would both flatten to Box_A_B.
   Class Box<T>
      Public Item As T
   End Class

   Class TDemo
      Public Sub Run()
         Dim a As Box<A_B>
         Dim b As Box<A>
      End Sub
   End Class

End Namespace
